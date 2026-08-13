"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CyberBackground } from "@/components/common";
import contactData from "@/data/contact.json";
import contactDataNl from "@/data/contact.nl.json";
import { useLocale } from "@/lib/use-locale";
import { localizedPath } from "@/lib/i18n";

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export default function Contact() {
  const locale = useLocale();
  const pageData = locale === "nl" ? contactDataNl : contactData;
  const copy =
    locale === "nl"
      ? {
          sent: "Bericht verzonden!",
          error: "Er is iets misgegaan",
          sentText: "Bedankt voor uw bericht. Ik neem zo snel mogelijk contact met u op.",
          errorText: "Uw bericht kon niet worden verzonden. Probeer het opnieuw of mail rechtstreeks naar info@bitwise-security.nl.",
          done: "Gereed",
          retry: "Opnieuw proberen",
          titlePrefix: "NEEM",
          titleAccent: "CONTACT OP",
          intro: "Een beveiligingsonderzoek of professionele website nodig? Laten we uw doelen en de beste vervolgstap bespreken.",
          sendMessage: "Stuur een bericht",
          fullName: "Volledige naam *",
          email: "E-mailadres *",
          company: "Bedrijfsnaam",
          service: "Gewenste dienst *",
          select: "Kies een dienst",
          message: "Bericht *",
          privacyPrefix: "Wij gebruiken uw gegevens uitsluitend om op uw aanvraag te reageren. Vermeld geen wachtwoorden of gevoelige informatie over kwetsbaarheden. Lees ons",
          privacy: "Privacy- en cookiebeleid",
          sending: "BEZIG MET VERZENDEN...",
          send: "BERICHT VERZENDEN",
          contactInfo: "Contactgegevens",
          certifications: "Certificeringen",
          visitProject: "Bekijk liveproject",
        }
      : {
          sent: "Message Sent!",
          error: "Something Went Wrong",
          sentText: "Thank you for reaching out! We will get back to you as soon as possible.",
          errorText: "Failed to send your message. Please try again or email us directly at info@bitwise-security.nl",
          done: "Done",
          retry: "Try Again",
          titlePrefix: "GET IN",
          titleAccent: "TOUCH",
          intro: "Need a security assessment or a professional website? Let's discuss your goals and the right next step.",
          sendMessage: "Send a Message",
          fullName: "Full Name *",
          email: "Email Address *",
          company: "Company Name",
          service: "Service Interested In *",
          select: "Select a service",
          message: "Message *",
          privacyPrefix: "We use the information you provide to respond to your enquiry. Please do not include passwords or sensitive vulnerability evidence. See our",
          privacy: "Privacy & Cookie Policy",
          sending: "SENDING...",
          send: "SEND MESSAGE",
          contactInfo: "Contact Information",
          certifications: "Certifications",
          visitProject: "Visit live project",
        };
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
              {status === "sent" ? copy.sent : copy.error}
            </h3>

            <p className="text-gray-300 mb-6">
              {status === "sent" ? copy.sentText : copy.errorText}
            </p>

            <button
              onClick={closePopup}
              className={`px-8 py-3 rounded-lg font-semibold text-white transition-all duration-300 hover:scale-105 ${
                status === "sent"
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-red-500 hover:bg-red-600"
              }`}
            >
              {status === "sent" ? copy.done : copy.retry}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            <span className="text-white">{copy.titlePrefix}</span>{" "}
            <span className="text-cyber-blue text-glow">{copy.titleAccent}</span>
          </h1>
          <div className="h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange mx-auto mb-6"></div>
          <p className="text-gray-300 text-xl max-w-3xl mx-auto">
            {copy.intro}
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow">
            <h2 className="text-3xl font-bold text-cyber-blue mb-6">
              {copy.sendMessage}
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
                  {copy.fullName}
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
                  placeholder={pageData.formFields[0].placeholder}
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {copy.email}
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
                  placeholder={pageData.formFields[1].placeholder}
                />
              </div>

              <div>
                <label
                  htmlFor="company"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {copy.company}
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  maxLength={160}
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-cyber-dark border border-cyber-blue/30 rounded-lg text-white placeholder-gray-500 focus:border-cyber-blue focus:outline-none focus:ring-2 focus:ring-cyber-blue/50 transition-all"
                  placeholder={pageData.formFields[2].placeholder}
                />
              </div>

              <div>
                <label
                  htmlFor="service"
                  className="block text-sm font-medium text-gray-300 mb-2"
                >
                  {copy.service}
                </label>
                <select
                  id="service"
                  name="service"
                  required
                  value={formData.service}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-cyber-dark border border-cyber-blue/30 rounded-lg text-white focus:border-cyber-blue focus:outline-none focus:ring-2 focus:ring-cyber-blue/50 transition-all"
                >
                  <option value="">{copy.select}</option>
                  {pageData.serviceOptions.map((service, index) => (
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
                  {copy.message}
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
                  placeholder={pageData.formFields[4].placeholder}
                />
              </div>

              <p className="text-xs leading-5 text-gray-400">
                {copy.privacyPrefix}{" "}
                <Link
                  href={localizedPath("/privacy", locale)}
                  className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 hover:text-cyan-300"
                >
                  {copy.privacy}
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
                {status === "sending" ? copy.sending : copy.send}
              </button>
            </form>
          </div>

          {/* Contact Information */}
          <div className="space-y-8">
            <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-orange/30 rounded-2xl p-8 box-glow-orange">
              <h2 className="text-3xl font-bold text-cyber-orange mb-6">
                {copy.contactInfo}
              </h2>
              <div className="space-y-6">
                {pageData.contactMethods.map((method, index) => (
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
                {copy.certifications}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {pageData.certifications.map((cert, index) => (
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
                {pageData.availability.title}
              </h3>
              <p className="text-gray-300">
                {pageData.availability.description}
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
              {pageData.websiteProjects.eyebrow}
            </p>
            <h2
              id="website-work-heading"
              className="text-3xl md:text-4xl font-bold text-white mb-4"
            >
              {pageData.websiteProjects.title}
            </h2>
            <p className="text-lg leading-relaxed text-gray-300">
              {pageData.websiteProjects.description}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {pageData.websiteProjects.items.map((project) => (
              <a
                key={project.url}
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col overflow-hidden rounded-2xl border border-cyber-blue/25 bg-cyber-darkBlue/75 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyber-blue/70 hover:shadow-lg hover:shadow-cyber-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-blue focus-visible:ring-offset-2 focus-visible:ring-offset-cyber-dark"
              >
                <div className="relative aspect-[16/10] overflow-hidden border-b border-cyber-blue/20 bg-cyber-dark">
                  <Image
                    src={project.image}
                    alt={project.imageAlt}
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-cyber-dark/60 via-transparent to-cyber-dark/10" />
                  <span className="absolute left-4 top-4 rounded-md border border-cyber-blue/35 bg-cyber-dark/90 px-2.5 py-1 font-mono text-xs text-cyber-blue backdrop-blur-sm">
                    {project.number}
                  </span>
                  <span className="absolute right-4 top-4 rounded-full border border-cyber-orange/40 bg-cyber-dark/90 px-3 py-1 text-xs font-medium text-cyber-orange backdrop-blur-sm">
                    {project.type}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-2xl font-bold text-white mb-3 transition-colors group-hover:text-cyber-blue">
                    {project.title}
                  </h3>
                  <p className="text-sm leading-6 text-gray-300">
                    {project.description}
                  </p>

                  <div className="mt-8 border-t border-cyber-blue/15 pt-5 md:mt-auto">
                    <span className="block truncate font-mono text-xs text-gray-400 mb-2">
                      {project.domain}
                    </span>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyber-blue">
                      {copy.visitProject}
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
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
