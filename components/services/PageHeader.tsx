export default function PageHeader() {
  return (
    <div className="text-center mb-16">
      <h1 className="text-5xl font-bold mb-4">
        <span className="text-white">OUR</span>{" "}
        <span className="text-cyber-blue text-glow">SERVICES</span>
      </h1>
      <div className="h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange mx-auto mb-6"></div>
      <p className="text-gray-300 text-xl max-w-3xl mx-auto">
        Hands-on security testing and professional website development for
        organisations that value clarity, resilience, and direct communication.
      </p>
    </div>
  );
}
