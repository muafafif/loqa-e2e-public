import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { WhyLocal } from "@/components/WhyLocal";
import { Pricing } from "@/components/Pricing";
import { Download } from "@/components/Download";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Features />
      <WhyLocal />
      <Pricing compact={true} />
      <Download />
      <Footer />
    </main>
  );
}
