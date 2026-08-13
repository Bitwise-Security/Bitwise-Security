"use client";

import { CyberBackground } from "@/components/common";
import Image from "next/image";

export default function About() {
  return (
    <main className="relative min-h-screen pt-24 pb-16">
      <CyberBackground />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            <span className="text-white">THE CORE</span>{" "}
            <span className="text-cyber-blue text-glow">PROTOCOL</span>
          </h1>
          <div className="h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange mx-auto"></div>
          <p className="text-cyber-orange font-mono text-sm mt-4">
            [ STATUS: AUTHORIZED ]
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {/* Profile Image */}
          <div className="lg:col-span-1">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyber-blue to-cyber-orange blur-2xl opacity-30 animate-pulse"></div>
              <div className="relative bg-cyber-darkBlue border-2 border-cyber-blue/50 rounded-2xl p-4 box-glow">
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-cyber-dark to-cyber-darkBlue flex items-center justify-center">
                  {/* Placeholder for profile image */}
                  <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                    {/* <svg
                      className="w-32 h-32 text-cyber-blue opacity-50"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg> */}
                    <Image
                      src="/profile.jpg"
                      alt="Bitwise Security penetration testing specialist"
                      width={400}
                      height={400}
                      className="w-full h-full object-cover rounded-xl"
                    />
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <h3 className="text-xl font-bold text-white mb-1">
                    Security Specialist
                  </h3>
                  <p className="text-cyber-blue text-sm font-mono">
                    OSCP • OSWE • OSEP
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* About Me Content */}
          <div className="lg:col-span-2">
            <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow scanline">
              <h2 className="text-3xl font-bold text-cyber-orange mb-6">
                ABOUT ME
              </h2>

              <p className="text-gray-300 leading-relaxed mb-6 text-lg">
                I have always been driven by a deep-seated curiosity about how
                systems work and how they are built. For me, hacking isn&apos;t
                just a career&mdash;it&apos;s a lifelong passion. I am
                constantly diving into the latest software, refining my
                methodology, and studying new ways to improve security. This
                relentless drive to learn ensures that when I test your
                environment, I am bringing the most up-to-date knowledge and a
                creative problem-solving approach to every project.
              </p>

              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-cyber-blue/20 border border-cyber-blue rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-cyber-blue"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">
                      Continuous Learning
                    </h4>
                    <p className="text-gray-400 text-sm">
                      Always studying the latest attack vectors and defense
                      mechanisms
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-cyber-orange/20 border border-cyber-orange rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-cyber-orange"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">
                      Creative Approach
                    </h4>
                    <p className="text-gray-400 text-sm">
                      Thinking like an attacker to find vulnerabilities others
                      miss
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Sections */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Services & Expertise */}
          <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow">
            <h2 className="text-2xl font-bold text-cyber-blue mb-4">
              Services & Expertise
            </h2>
            <p className="text-gray-300 leading-relaxed">
              I specialize in comprehensive security assessments designed to
              identify vulnerabilities before they can be exploited. My core
              services include Web Application Penetration Testing, Network
              Security Audits, and Social Engineering simulations. Whether you
              are a startup looking to secure your first MVP or an established
              enterprise needing a recurring compliance check, I provide
              detailed, actionable reports that prioritize remediation based on
              actual risk to your business.
            </p>
          </div>

          {/* Why Work With Me */}
          <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-orange/30 rounded-2xl p-8 box-glow-orange">
            <h2 className="text-2xl font-bold text-cyber-orange mb-4">
              Why Work With Me?
            </h2>
            <p className="text-gray-300 leading-relaxed">
              In an era of evolving threats, you need a partner who stays ahead
              of the curve. I hold industry-recognized certifications (OSCP,
              OSWE, and OSEP) and have a proven track record of uncovering
              critical vulnerabilities in complex environments. When you hire
              me, you aren&apos;t just getting a scan&mdash;you&apos;re getting
              a dedicated security partner. Every engagement concludes with a
              comprehensive debriefing session to ensure your team fully
              understands the findings and the necessary steps for remediation.
            </p>
          </div>
        </div>

        {/* My Approach */}
        <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow mb-8">
          <h2 className="text-2xl font-bold text-cyber-blue mb-4">
            My Approach
          </h2>
          <p className="text-gray-300 leading-relaxed mb-6">
            Security is not a &apos;one-size-fits-all&apos; solution. I follow a
            structured, ethical methodology beginning with deep reconnaissance
            and moving through vulnerability analysis to exploitation and
            reporting. I utilize the industry-standard OWASP and PTES frameworks
            to ensure thoroughness. My goal is not just to find
            &apos;bugs,&apos; but to provide a clear roadmap for your
            development team to strengthen your overall security posture without
            disrupting your daily operations.
          </p>

          <div className="grid md:grid-cols-4 gap-4">
            {["Reconnaissance", "Analysis", "Exploitation", "Reporting"].map(
              (step, index) => (
                <div
                  key={index}
                  className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-lg p-4 text-center"
                >
                  <div className="text-2xl font-bold text-cyber-blue mb-2">
                    {index + 1}
                  </div>
                  <div className="text-sm text-gray-300">{step}</div>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Detailed Deliverables */}
        <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-orange/30 rounded-2xl p-8 box-glow-orange">
          <h2 className="text-2xl font-bold text-cyber-orange mb-4">
            Detailed Deliverables
          </h2>
          <p className="text-gray-300 leading-relaxed mb-6">
            At the conclusion of every engagement, you receive more than just a
            list of vulnerabilities. I provide an Executive Summary for
            non-technical stakeholders to understand business risk, alongside a
            Technical Deep-Dive for your engineering team. Each finding includes
            a severity rating, a proof-of-concept, and clear remediation steps.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">Executive Summary</span>
            </div>
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">Technical Deep-Dive</span>
            </div>
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">Severity Ratings</span>
            </div>
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">Remediation Steps</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
