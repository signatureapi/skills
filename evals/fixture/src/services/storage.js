import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
const s3 = new S3Client({});
export async function uploadPdf(key, body) { await s3.send(new PutObjectCommand({ Bucket: process.env.DOCS_BUCKET, Key: key, Body: body })); return key; }
