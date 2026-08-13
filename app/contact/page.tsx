"use client";

import Link from "next/link";
import { useState } from "react";
import { CyberBackground } from "@/components/common";
import contactData from "@/data/contact.json";

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    service: "",
    message: "",
    website: "",
  });
  const [status, setStatus] = useState("");
  const [showPopup, setShowPopup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed");

      setStatus("sent");
      setShowPopup(true);
      setFormData({
        name: "",
        email: "",
        company: "",
        service: "",
        message: "",
        website: "",
      });
    } catch {
      setStatus("error");
      setShowPopup(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<FormField>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const closePopup = () => {
    setShowPopup(false);
    setStatus("");
  };

  return (
    <main className="relative min-h-screen pt-24 pb-16">
      <CyberBackground />

      {/* Popup Modal */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closePopup}
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-2xl p-8 text-center border shadow-2xl ${
              status === "sent"
                ? "bg-cyber-darkBlue border-green-500/50"
                : "bg-cyber-darkBlue border-red-500/50"
            }`}
          >
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                status === "sent" ? "bg-green-500/20" : "bg-red-500/20"
              }`}
            >
              {status === "sent" ? (
                <svg
                  className="w-8 h-8 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </div>

            <h3
              className={`text-2xl font-bold mb-2 ${status === "sent" ? "text-green-400" : "text-red-400"}`}
            >
              {status === "sent" ? "Message Sent!" : "Something Went Wrong"}
            </h3>

            <p className="text-gray-300 mb-6">
              {status === "sent"
                ? "Thank you for reaching out! We will get back to you as soon as possible. 🙌"
                : "Failed to send your message. Please try again or email us directly at info@bitwise-security.nl"}
            </p>

            <button
              onClick={closePopup}
              className={`px-8 py-3 rounded-lg font-semibold text-white transition-all duration-300 hover:scale-105 ${
                status === "sent"
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {status === "sent" ? "Done" : "Try Again"}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            <span className="text-white">GET IN</span>{" "}
            <span className="text-cyber-blue text-glow">TOUCH</span>
          </h1>
          <div className="h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange mx-auto mb-6"></div>
          <p className="text-gray-300 text-xl max-w-3xl mx-auto">
            Need a security assessment or a professional website? Let&apos;s
            discuss your goals and the right next step.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow">
            <h2 className="text-3xl font-bold text-cyber-blue mb-6">
              Send a Message
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  type="text"
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData.website}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Full Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  maxLength={120}
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-cyber-dark border border-cyber-blue/30 rounded-lg text-white placeholder-gray-500 focus:border-cyber-blue focus:outline-none focus:ring-2 focus:ring-cyber-blue/50 transition-all"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  maxLength={254}
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-cyber-dark border border-cyber-blue/30 rounded-lg text-white placeholder-gray-500 focus:border-cyber-blue focus:outline-none focus:ring-2 focus:ring-cyber-blue/50 transition-all"
                  placeholder="john@company.com"
                />
              </div>

              <div>
                <label
                  htmlFor="company"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Company Name
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  maxLength={160}
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-cyber-dark border border-cyber-blue/30 rounded-lg text-white placeholder-gray-500 focus:border-cyber-blue focus:outline-none focus:ring-2 focus:ring-cyber-blue/50 transition-all"
                  placeholder="Your Company"
                />
              </div>

              <div>
                <label
                  htmlFor="service"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Service Interested In *
                </label>
                <select
                  id="service"
                  name="service"
                  required
                  value={formData.service}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-cyber-dark border border-cyber-blue/30 rounded-lg text-white focus:border-cyber-blue focus:outline-none focus:ring-2 focus:ring-cyber-blue/50 transition-all"
                >
                  <option value="">Select a service</option>
                  {contactData.serviceOptions.map((service, index) => (
                    <option key={index} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  Message *
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  maxLength={5000}
                  value={formData.message}
                  onChange={handleChange}
                  rows={5}
                  className="w-full px-4 py-3 bg-cyber-dark border border-cyber-blue/30 rounded-lg text-white placeholder-gray-500 focus:border-cyber-blue focus:outline-none focus:ring-2 focus:ring-cyber-blue/50 transition-all resize-none"
                  placeholder="Tell us about your project, goals, and timeline..."
                />
              </div>

              <p className="text-xs leading-5 text-gray-400">
                We use the information you provide to respond to your enquiry.
                Please do not include passwords or sensitive vulnerability
                evidence. See our{" "}
                <Link
                  href="/privacy"
                  className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 hover:text-cyan-300"
                >
                  Privacy &amp; Cookie Policy
                </Link>
                .
              </p>

              <button
                type="submit"
                disabled={status === "sending"}
                className={`w-full py-4 rounded-lg font-semibold text-white transition-all duration-300 ${
                  status === "sending"
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-gradient-to-r from-cyber-blue to-cyan-500 hover:shadow-lg hover:shadow-cyber-blue/50 hover:scale-105"
                }`}
              >
                {status === "sending" ? "SENDING..." : "SEND MESSAGE"}
              </button>
            </form>
          </div>

          {/* Contact Information */}
          <div className="space-y-8">
            <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-orange/30 rounded-2xl p-8 box-glow-orange">
              <h2 className="text-3xl font-bold text-cyber-orange mb-6">
                Contact Information
              </h2>
              <div className="space-y-6">
                {contactData.contactMethods.map((method, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-cyber-orange/20 border border-cyber-orange rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-6 h-6 text-cyber-orange"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d={method.svgPath} />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-white font-semibold mb-1">
                        {method.title}
                      </h3>
                      {method.link ? (
                        <a
                          href={method.link}
                          className="text-cyber-orange hover:text-orange-400 transition-colors"
                        >
                          {method.value}
                        </a>
                      ) : (
                        <p className="text-gray-400">{method.value}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow">
              <h3 className="text-2xl font-bold text-cyber-blue mb-6">
                Certifications
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {contactData.certifications.map((cert, index) => (
                  <div
                    key={index}
                    className="bg-cyber-dark/50 border border-cyber-blue/30 rounded-lg p-4 text-center"
                  >
                    <div className="text-2xl font-bold text-cyber-blue">
                      {cert}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-cyber-darkBlue to-cyber-dark border border-cyber-blue/30 rounded-2xl p-8 box-glow">
              <h3 className="text-2xl font-bold text-cyber-blue mb-4">
                {contactData.availability.title}
              </h3>
              <p className="text-gray-300">
                {contactData.availability.description}
              </p>
            </div>
          </div>
        </div>

        <section
          aria-labelledby="website-work-heading"
          className="mt-24 border-t border-cyber-blue/20 pt-16"
        >
          <div className="max-w-3xl mb-10">
            <p className="text-sm font-mono tracking-[0.2em] text-cyber-blue mb-3">
              {contactData.websiteProjects.eyebrow}
            </p>
            <h2
              id="website-work-heading"
              className="text-3xl md:text-4xl font-bold text-white mb-4"
            >
              {contactData.websiteProjects.title}
            </h2>
            <p className="text-lg leading-relaxed text-gray-300">
              {contactData.websiteProjects.description}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {contactData.websiteProjects.items.map((project) => (
              <a
                key={project.url}
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-[320px] flex-col rounded-2xl border border-cyber-blue/25 bg-cyber-darkBlue/75 p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyber-blue/70 hover:shadow-lg hover:shadow-cyber-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-blue focus-visible:ring-offset-2 focus-visible:ring-offset-cyber-dark"
              >
                <div className="flex items-start justify-between gap-4 mb-10">
                  <span className="font-mono text-sm text-cyber-blue">
                    {project.number}
                  </span>
                  <span className="rounded-full border border-cyber-orange/35 bg-cyber-orange/10 px-3 py-1 text-xs font-medium text-cyber-orange">
                    {project.type}
                  </span>
                </div>

                <h3 className="text-2xl font-bold text-white mb-3 transition-colors group-hover:text-cyber-blue">
                  {project.title}
                </h3>
                <p className="text-sm leading-6 text-gray-300">
                  {project.description}
                </p>

                <div className="mt-auto border-t border-cyber-blue/15 pt-5">
                  <span className="block truncate font-mono text-xs text-gray-400 mb-2">
                    {project.domain}
                  </span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyber-blue">
                    Visit live project
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 17 17 7M7 7h10v10"
                      />
                    </svg>
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
