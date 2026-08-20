"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { ProjectDashboard } from "./ProjectDashboard";
import { ProjectsPanel } from "./ProjectsPanel";
import { RABPanel } from "./RABPanel";
import { WorkersPanel } from "./WorkersPanel";
import { InvoicesPanel } from "./InvoicesPanel";
import { clsx } from "clsx";
import { BarChart2, FolderKanban, Calculator, Users, FileText, ChevronLeft } from "lucide-react";
import type { Project } from "@/types";

type MainTab = "dashboard" | "projects";
type SubTab = "rab" | "workers" | "invoices";

export function ProjectMain() {
  const t = useT();
  const [mainTab, setMainTab] = useState<MainTab>("dashboard");
  const [subTab, setSubTab] = useState<SubTab>("rab");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const mainTabs: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: t("project.dashboard"), icon: <BarChart2 size={14} /> },
    { id: "projects",  label: t("project.projects"),  icon: <FolderKanban size={14} /> },
  ];

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "rab",      label: t("project.rab"),      icon: <Calculator size={14} /> },
    { id: "workers",  label: t("project.workers"),  icon: <Users size={14} /> },
    { id: "invoices", label: t("project.invoices"), icon: <FileText size={14} /> },
  ];

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setSubTab("rab");
    // Tidak ubah mainTab — tetap di "projects" tapi tampilkan sub-tab
  };

  const handleBackToList = () => {
    setSelectedProject(null);
  };

  // Mode: ada proyek terpilih = tampilkan detail + sub-tab
  const isDetailMode = mainTab === "projects" && selectedProject !== null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

      {/* Tab bar utama — hanya Dashboard dan Proyek */}
      <div className="flex items-center glass-surface border-b th-border shrink-0 px-3 gap-1 overflow-x-auto scrollbar-none">
        {mainTabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => {
              setMainTab(id);
              if (id !== "projects") setSelectedProject(null);
            }}
            className={clsx(
              "btn-brand flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl my-1.5 transition-all duration-150 whitespace-nowrap shrink-0",
              mainTab === id && !isDetailMode
                ? "bg-brand-600 text-white shadow-brand-sm"
                : "th-text-muted hover:th-text hover:th-bg-elevated font-medium"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Sub-tab bar — hanya muncul saat proyek sudah dipilih */}
      {isDetailMode && (
        <div className="flex items-center border-b th-border shrink-0 px-3 gap-1 overflow-x-auto scrollbar-none th-bg-elevated">
          {/* Tombol kembali ke list */}
          <button
            onClick={handleBackToList}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg th-text-muted hover:th-text transition-colors mr-1 shrink-0"
          >
            <ChevronLeft size={13} />
            <span className="text-xs">Daftar</span>
          </button>

          {/* Divider + nama proyek */}
          <div className="w-px h-4 th-border shrink-0 mr-2" />
          <div className="flex items-center gap-1.5 mr-3 shrink-0 max-w-[200px]">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selectedProject!.color }}
            />
            <span className="text-xs font-semibold th-text truncate">
              {selectedProject!.name}
            </span>
          </div>

          {/* Sub-tabs */}
          {subTabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={clsx(
                "btn-brand flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg my-1 transition-all duration-150 whitespace-nowrap shrink-0",
                subTab === id
                  ? "bg-brand-600 text-white shadow-brand-sm"
                  : "th-text-muted hover:th-text hover:th-bg-elevated"
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {mainTab === "dashboard" && (
          <ProjectDashboard
            onSelectProject={(p) => {
              setSelectedProject(p);
              setSubTab("rab");
              setMainTab("projects");
            }}
          />
        )}
        {mainTab === "projects" && !selectedProject && (
          <ProjectsPanel
            selectedProject={null}
            onSelectProject={handleSelectProject}
            pendingTab={null}
          />
        )}
        {isDetailMode && subTab === "rab"      && <RABPanel      project={selectedProject!} />}
        {isDetailMode && subTab === "workers"  && <WorkersPanel  project={selectedProject!} />}
        {isDetailMode && subTab === "invoices" && <InvoicesPanel project={selectedProject!} />}
      </div>
    </div>
  );
}
