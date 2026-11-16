import { repairHandler } from '../../combined-runtime.js';
export default function handler(req, res) { req.url = '/health'; return repairHandler(req, res); }
export const config = { api: { bodyParser: false, externalResolver: true } };
