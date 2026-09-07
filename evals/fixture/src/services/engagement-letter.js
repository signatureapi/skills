import PDFDocument from "pdfkit";
export async function renderEngagementLetter(engagementId) { const doc = new PDFDocument(); doc.text("Engagement letter"); doc.end(); return doc; }
