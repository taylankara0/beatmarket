import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return new Response('Missing file key parameter', { status: 400 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    const s3Response = await s3.send(command);

    // Stream the audio binary array chunks directly back to the HTML player
    return new Response(s3Response.Body, {
      headers: {
        'Content-Type': s3Response.ContentType || 'audio/mpeg',
        'Content-Length': s3Response.ContentLength,
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('Streaming error:', error);
    return new Response('File not found or storage error', { status: 404 });
  }
}