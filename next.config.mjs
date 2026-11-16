export default {
  outputFileTracingIncludes: {
    '/api/repairs/[[...path]]': ['./public/**'],
    '/api/commands': ['./public/**'],
    '/api/telegram/webhook': ['./public/**'],
    '/api/repair-health': ['./public/**'],
  },
  async rewrites() { return [{ source: '/health', destination: '/api/repair-health' }]; },
};
