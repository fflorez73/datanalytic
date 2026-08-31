/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // pdfkit (usado internamente por @react-pdf/renderer) carga sus fuentes
    // estándar (Helvetica, Times, Courier, ...) vía el mecanismo de Node
    // "subpath imports" del propio package.json de pdfkit
    // (require('#standard-fonts/Helvetica') -> ./js/standard-fonts/Helvetica.cjs).
    // El file tracer de Vercel/Next (@vercel/nft) no sigue ese `#`-specifier
    // estáticamente, así que esos .cjs/.mjs nunca quedan en el bundle de la
    // función serverless — funciona en local (node_modules completo en
    // disco) y falla en Vercel con "Cannot find module
    // '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'".
    // Se fuerza su inclusión explícitamente. Dos claves (ruta exacta +
    // comodín) porque el matcher usa picomatch con `contains: true` sobre
    // el path normalizado de la ruta — con dos patrones el match no
    // depende de acertar el formato exacto que Next usa internamente.
    outputFileTracingIncludes: {
      '/api/analyses/[id]/pdf': ['./node_modules/pdfkit/js/**/*'],
      '/api/analyses/**': ['./node_modules/pdfkit/js/**/*'],
    },
  },
};

export default nextConfig;
