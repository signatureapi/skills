import { Router } from "express";
import { renderEngagementLetter } from "../services/engagement-letter.js";
import { uploadPdf } from "../services/storage.js";
import { queue } from "../services/queue.js";
export const engagements = Router();
// POST /engagements/:id/accept — the client accepted the proposal; firm staff click "Start engagement".
engagements.post("/:id/accept", async (req, res) => {
  const firmId = req.session.firmId;
  const pdf = await renderEngagementLetter(req.params.id);
  const key = await uploadPdf(`firms/${firmId}/engagements/${req.params.id}/letter.pdf`, pdf);
  await queue.add("engagement.accepted", { engagementId: req.params.id, letterKey: key });
  res.json({ ok: true });
});
