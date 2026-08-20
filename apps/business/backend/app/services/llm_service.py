import asyncio
import json
import re
import time
import uuid
from typing import AsyncGenerator, Optional
from app.models.settings import ChatModelConfig, ChatProvider
from app.core.config import settings


# ── Plain-text tool call parsers ───────────────────────────────────────────────
# Many local GGUF models output tool calls as plain text tokens instead of
# populating message.tool_calls (which llama-cpp would parse for us).
# Each pattern covers a different model family's chat template format.

# Gemma 4: <|tool_call>call:NAME{args}<tool_call|>
_RE_GEMMA = re.compile(r"<\|tool_call>call:(\w+)\{(.*?)\}<tool_call\|>", re.DOTALL)

# Qwen 2.5 / 3: <tool_call>\n{"name": "NAME", "arguments": {...}}\n</tool_call>
_RE_QWEN = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)

# Llama 3.1 / 3.2: <|python_tag|>{"name": "NAME", "parameters": {...}}
_RE_LLAMA3 = re.compile(r"<\|python_tag\|>\s*(\{.*?\})", re.DOTALL)

# Mistral / Mixtral: [TOOL_CALLS] [{"name": "NAME", "arguments": {...}}, ...]
_RE_MISTRAL = re.compile(r"\[TOOL_CALLS\]\s*(\[.*?\])", re.DOTALL)

# DeepSeek: <｜tool▁calls▁begin｜>...<｜tool▁call▁begin｜>{...}<｜tool▁call▁end｜>
_RE_DEEPSEEK = re.compile(r"<｜tool▁call▁begin｜>\s*(\{.*?|\S.*?)\s*<｜tool▁call▁end｜>", re.DOTALL)

# Functionary v3: <|from|>assistant\n<|recipient|>NAME\n<|content|>{args}\n<|stop|>
_RE_FUNCTIONARY = re.compile(
    r"<\|from\|>assistant\n<\|recipient\|>(\w+)\n<\|content\|>(.*?)<\|stop\|>", re.DOTALL
)

# Gemini / generic bare-name: <tool_code>NAME</tool_code> or <tool_code>NAME\n{args}</tool_code>
_RE_TOOL_CODE = re.compile(r"<tool_code>\s*(\w+)\s*(\{.*?\})?\s*</tool_code>", re.DOTALL)

# Prefix patterns that signal the start of a tool call block (for streaming strip)
# These are used to detect and suppress tool call output in the final stream.
_TOOL_STRIP_PATTERNS = re.compile(
    r"(<\|tool_call>.*?(?:<tool_call\|>|$))"        # Gemma: <|tool_call>...<tool_call|>
    r"|(<tool_call>.*?(?:</tool_call>|$))"           # Qwen:  <tool_call>...</tool_call>
    r"|(<\|python_tag\|>.*?(?:\n|$))"               # Llama3: <|python_tag|>...
    r"|(\[TOOL_CALLS\].*?(?:\]|$))"                 # Mistral: [TOOL_CALLS][...]
    r"|(<｜tool▁call▁begin｜>.*?(?:<｜tool▁call▁end｜>|$))"  # DeepSeek
    r"|(<\|from\|>assistant.*?(?:<\|stop\|>|$))"    # Functionary
    r"|(<tool_code>.*?(?:</tool_code>|$))",          # Generic <tool_code>
    re.DOTALL,
)


def strip_tool_call_tokens(text: str) -> str:
    """Remove all known plain-text tool call formats from a string."""
    return _TOOL_STRIP_PATTERNS.sub("", text)


def _make_tc(name: str, args: dict) -> dict:
    return {
        "id": f"call_{uuid.uuid4().hex[:8]}",
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(args)},
    }


def _parse_plain_text_tool_calls(content: str) -> list[dict] | None:
    """
    Detect and parse tool calls that local models emit as plain text tokens
    rather than structured tool_calls. Covers Gemma 4, Qwen, Llama 3,
    Mistral, DeepSeek, Functionary, and generic <tool_code> formats.
    Returns None if no known pattern is found.
    """
    calls: list[dict] = []

    # Generic <tool_code>NAME</tool_code> or <tool_code>NAME\n{args}</tool_code>
    for name, args_blob in _RE_TOOL_CODE.findall(content):
        try:
            args = json.loads(args_blob) if args_blob.strip() else {}
        except Exception:
            args = {}
        if name:
            calls.append(_make_tc(name, args))

    # Gemma 4
    for name, args_str in _RE_GEMMA.findall(content):
        args_str = args_str.strip()
        try:
            args = json.loads("{" + args_str + "}") if args_str else {}
        except Exception:
            args = {}
        calls.append(_make_tc(name, args))

    # Qwen / generic <tool_call>{json}</tool_call>
    for blob in _RE_QWEN.findall(content):
        try:
            obj = json.loads(blob)
            name = obj.get("name") or obj.get("function", {}).get("name", "")
            args = obj.get("arguments") or obj.get("parameters") or {}
            if name:
                calls.append(_make_tc(name, args))
        except Exception:
            pass

    # Llama 3
    for blob in _RE_LLAMA3.findall(content):
        try:
            obj = json.loads(blob)
            name = obj.get("name", "")
            args = obj.get("parameters") or obj.get("arguments") or {}
            if name:
                calls.append(_make_tc(name, args))
        except Exception:
            pass

    # Mistral: array of tool call objects
    for blob in _RE_MISTRAL.findall(content):
        try:
            arr = json.loads(blob)
            for obj in (arr if isinstance(arr, list) else [arr]):
                name = obj.get("name", "")
                args = obj.get("arguments") or {}
                if name:
                    calls.append(_make_tc(name, args))
        except Exception:
            pass

    # DeepSeek
    for blob in _RE_DEEPSEEK.findall(content):
        try:
            obj = json.loads(blob)
            name = obj.get("name", "")
            args = obj.get("arguments") or obj.get("parameters") or {}
            if name:
                calls.append(_make_tc(name, args))
        except Exception:
            pass

    # Functionary
    for name, args_str in _RE_FUNCTIONARY.findall(content):
        try:
            args = json.loads(args_str.strip()) if args_str.strip() else {}
        except Exception:
            args = {}
        calls.append(_make_tc(name, args))

    return calls if calls else None


def _estimate_tokens(text: str | None) -> int:
    # rough approximation: ~4 chars per token
    return max(1, len(text or "") // 4)


def _flatten_tool_messages(messages: list[dict]) -> list[dict]:
    """
    Convert OpenAI-style tool call / tool result messages into plain
    user/assistant turns that any model can handle without re-rendering
    tool call tokens.

    Before:
        {role: assistant, tool_calls: [...]}
        {role: tool, tool_call_id: ..., content: "...result..."}
    After:
        {role: assistant, content: "[Called: tool_name]\n[Result: ...]"}
    """
    result: list[dict] = []
    # Build a lookup: tool_call_id -> result content
    tool_results: dict[str, str] = {}
    for m in messages:
        if m.get("role") == "tool":
            tool_results[m.get("tool_call_id", "")] = m.get("content", "")

    skip_ids: set[str] = set()
    for m in messages:
        role = m.get("role")
        if role == "tool":
            # Already consumed into the assistant message above — skip
            continue
        if role == "assistant" and m.get("tool_calls"):
            # Flatten: summarise tool calls + results as plain assistant text
            parts = []
            for tc in m["tool_calls"]:
                name = tc["function"]["name"]
                tc_id = tc.get("id", "")
                res = tool_results.get(tc_id, "(no result)")
                parts.append(f"[Tool called: {name}]\n[Result: {res}]")
                skip_ids.add(tc_id)
            combined = "\n\n".join(parts)
            # Keep any non-tool text the assistant wrote alongside the call
            extra = (m.get("content") or "").strip()
            if extra:
                combined = extra + "\n\n" + combined
            result.append({"role": "assistant", "content": combined})
        else:
            result.append(m)
    return result


class LLMService:
    def __init__(self):
        self._local_model = None
        self._loaded_model_name: Optional[str] = None

    def _load_local_model(self, model_name: str):
        from llama_cpp import Llama

        if self._loaded_model_name == model_name and self._local_model is not None:
            return

        model_path = settings.chat_models_dir / model_name
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")

        self._local_model = Llama(
            model_path=str(model_path),
            n_ctx=settings.n_ctx,
            n_threads=settings.n_threads,
            n_gpu_layers=settings.n_gpu_layers,
            verbose=False,
        )
        self._loaded_model_name = model_name

    async def stream_chat(
        self,
        messages: list[dict],
        config: ChatModelConfig,
    ) -> AsyncGenerator[str, None]:
        """Yields text tokens. Final yield is a sentinel dict with metrics."""
        t0 = time.monotonic()
        output_tokens = 0

        if config.provider == ChatProvider.LOCAL:
            gen = self._stream_local(messages, config)
        elif config.provider == ChatProvider.OLLAMA:
            # Ollama speaks OpenAI-compatible protocol; endpoint defaults to localhost:11434/v1
            ollama_cfg = config.model_copy(update={
                "endpoint": config.endpoint or "http://localhost:11434/v1",
                "api_key": "ollama",
            })
            gen = self._stream_openai_compatible(messages, ollama_cfg)
        elif config.provider == ChatProvider.OPENAI:
            gen = self._stream_openai(messages, config)
        elif config.provider == ChatProvider.GEMINI:
            gen = self._stream_gemini(messages, config)
        elif config.provider == ChatProvider.DEEPSEEK:
            deepseek_cfg = config.model_copy(update={
                "endpoint": config.endpoint or "https://api.deepseek.com",
                "model_name": config.model_name or "deepseek-v4-flash",
            })
            gen = self._stream_openai_compatible(messages, deepseek_cfg)
        elif config.provider == ChatProvider.OPENAI_COMPATIBLE:
            gen = self._stream_openai_compatible(messages, config)
        else:
            return

        async for item in gen:
            if isinstance(item, dict):
                # provider passed back exact token counts
                yield item
                return
            yield item
            output_tokens += _estimate_tokens(item)

        input_tokens = sum(_estimate_tokens(m.get("content", "")) for m in messages)
        latency_ms = round((time.monotonic() - t0) * 1000)
        yield {
            "__metrics__": True,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": latency_ms,
        }

    async def _stream_local(
        self, messages: list[dict], config: ChatModelConfig
    ) -> AsyncGenerator[str, None]:
        self._load_local_model(config.model_name)

        t0 = time.monotonic()
        output_tokens = 0

        stream = self._local_model.create_chat_completion(
            messages=messages,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            stream=True,
        )
        for chunk in stream:
            delta = chunk["choices"][0].get("delta", {}).get("content")
            if delta:
                output_tokens += 1
                yield delta

        input_tokens = sum(_estimate_tokens(m.get("content", "")) for m in messages)
        yield {
            "__metrics__": True,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": round((time.monotonic() - t0) * 1000),
        }

    async def _stream_openai(
        self, messages: list[dict], config: ChatModelConfig
    ) -> AsyncGenerator[str, None]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=config.api_key)
        t0 = time.monotonic()
        output_tokens = 0
        stream = await client.chat.completions.create(
            model=config.model_name or "gpt-4o-mini",
            messages=messages,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            stream=True,
            stream_options={"include_usage": True},
        )
        input_tokens = 0
        async for chunk in stream:
            if chunk.usage:
                input_tokens = chunk.usage.prompt_tokens
                output_tokens = chunk.usage.completion_tokens
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

        yield {
            "__metrics__": True,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": round((time.monotonic() - t0) * 1000),
        }

    async def _stream_openai_compatible(
        self, messages: list[dict], config: ChatModelConfig
    ) -> AsyncGenerator[str, None]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=config.api_key or "not-needed",
            base_url=config.endpoint,
        )
        t0 = time.monotonic()
        output_tokens = 0
        input_tokens = sum(_estimate_tokens(m.get("content", "")) for m in messages)
        stream = await client.chat.completions.create(
            model=config.model_name,
            messages=messages,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                output_tokens += _estimate_tokens(delta)
                yield delta

        yield {
            "__metrics__": True,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": round((time.monotonic() - t0) * 1000),
        }

    async def _stream_gemini(
        self, messages: list[dict], config: ChatModelConfig
    ) -> AsyncGenerator[str, None]:
        import google.generativeai as genai

        genai.configure(api_key=config.api_key)
        model = genai.GenerativeModel(config.model_name or "gemini-1.5-flash")

        history = []
        last_user_message = ""
        for msg in messages:
            if msg["role"] == "system":
                continue
            if msg["role"] == "user":
                last_user_message = msg["content"]
            elif msg["role"] == "assistant":
                history.append({"role": "model", "parts": [msg["content"]]})

        t0 = time.monotonic()
        chat = model.start_chat(history=history)
        response = await chat.send_message_async(last_user_message, stream=True)

        input_tokens = 0
        output_tokens = 0
        async for chunk in response:
            if chunk.text:
                yield chunk.text
            if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                input_tokens = chunk.usage_metadata.prompt_token_count or 0
                output_tokens = chunk.usage_metadata.candidates_token_count or 0

        yield {
            "__metrics__": True,
            "input_tokens": input_tokens or _estimate_tokens(last_user_message),
            "output_tokens": output_tokens,
            "latency_ms": round((time.monotonic() - t0) * 1000),
        }

    async def complete_with_tools(
        self,
        messages: list[dict],
        config: ChatModelConfig,
        tools: list[dict],
        force_tool: bool = False,
    ) -> dict:
        """
        Non-streaming call that returns the model's response including any tool_calls.
        Returns dict with keys: content, tool_calls, finish_reason.
        Raises NotImplementedError for providers that don't support tools (Gemini).
        force_tool=True passes tool_choice="required" to force at least one tool call.
        """
        if config.provider == ChatProvider.LOCAL:
            return await asyncio.get_event_loop().run_in_executor(
                None, lambda: self._complete_local_with_tools(messages, config, tools, force_tool)
            )
        elif config.provider == ChatProvider.OLLAMA:
            ollama_cfg = config.model_copy(update={
                "provider": ChatProvider.OPENAI_COMPATIBLE,
                "endpoint": config.endpoint or "http://localhost:11434/v1",
                "api_key": "ollama",
            })
            return await self._complete_openai_with_tools(messages, ollama_cfg, tools, force_tool)
        elif config.provider == ChatProvider.DEEPSEEK:
            deepseek_cfg = config.model_copy(update={
                "endpoint": config.endpoint or "https://api.deepseek.com",
                "model_name": config.model_name or "deepseek-v4-flash",
            })
            return await self._complete_openai_with_tools(messages, deepseek_cfg, tools, force_tool)
        elif config.provider in (ChatProvider.OPENAI, ChatProvider.OPENAI_COMPATIBLE):
            return await self._complete_openai_with_tools(messages, config, tools, force_tool)
        elif config.provider == ChatProvider.GEMINI:
            raise NotImplementedError("Gemini tool calling not supported — using context injection fallback")
        else:
            raise NotImplementedError(f"Tool calling not supported for provider: {config.provider}")

    def _complete_local_with_tools(
        self, messages: list[dict], config: ChatModelConfig, tools: list[dict],
        force_tool: bool = False,
    ) -> dict:
        self._load_local_model(config.model_name)
        # Local GGUF models often don't support "required" tool_choice — always use "auto"
        # and rely on Gemma-format plain-text tool call parsing as fallback.
        response = self._local_model.create_chat_completion(
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            stream=False,
        )
        choice = response["choices"][0]
        message = choice.get("message", {})
        tool_calls = message.get("tool_calls")
        finish_reason = choice.get("finish_reason", "stop")
        content = message.get("content")

        # Many local models output tool calls as plain text tokens instead of
        # populating message.tool_calls. Try all known format parsers.
        if not tool_calls and content:
            tool_calls = _parse_plain_text_tool_calls(content)
            if tool_calls:
                finish_reason = "tool_calls"
                # Strip all known tool-call tokens from content
                clean = content
                for pattern in (_RE_GEMMA, _RE_QWEN, _RE_LLAMA3, _RE_MISTRAL, _RE_DEEPSEEK, _RE_FUNCTIONARY, _RE_TOOL_CODE):
                    clean = pattern.sub("", clean)
                content = clean.strip() or None

        return {
            "content": content,
            "tool_calls": tool_calls,
            "finish_reason": finish_reason,
        }

    async def _complete_openai_with_tools(
        self, messages: list[dict], config: ChatModelConfig, tools: list[dict],
        force_tool: bool = False,
    ) -> dict:
        from openai import AsyncOpenAI

        kwargs = {"api_key": config.api_key or "not-needed"}
        if config.provider in (ChatProvider.OPENAI_COMPATIBLE, ChatProvider.OLLAMA, ChatProvider.DEEPSEEK):
            kwargs["base_url"] = config.endpoint or "https://api.deepseek.com"

        tool_choice = "required" if force_tool else "auto"
        client = AsyncOpenAI(**kwargs)
        response = await client.chat.completions.create(
            model=config.model_name,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            max_tokens=config.max_tokens,
            temperature=config.temperature,
            stream=False,
        )
        choice = response.choices[0]
        message = choice.message
        tool_calls = None
        if message.tool_calls:
            tool_calls = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in message.tool_calls
            ]
        return {
            "content": message.content,
            "tool_calls": tool_calls,
            "finish_reason": choice.finish_reason,
        }

    def unload(self):
        self._local_model = None
        self._loaded_model_name = None


llm_service = LLMService()
