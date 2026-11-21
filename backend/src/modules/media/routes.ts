import { Router } from 'express';
import { z } from 'zod';
import { assetNames } from './config.js';
import { imageLocation } from './service.js';
import { MediaAsset } from './models.js';
export const mediaRouter = Router();
mediaRouter.get('/credits', async (_req, res) => {
  const assets = await MediaAsset.find({ 'attribution.sourceUrl': { $exists: true } })
    .sort({ name: 1 })
    .lean();
  res.json({ data: assets.map((a) => ({ path: `/media/${a.name}`, ...a.attribution })) });
});
mediaRouter.get('/:name', async (req, res) => {
  const name = z
    .union([z.enum(assetNames), z.string().regex(/^product-[a-f0-9]{24}$/)])
    .parse(req.params.name);
  res.json({ data: await imageLocation(name) });
});
