import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "@/lib/r2";

export async function POST(request) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "Missing filename or contentType parameter" },
        { status: 400 }
      );
    }

    const uniqueKey = `${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: uniqueKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 60 });

    return NextResponse.json({
      uploadUrl,
      fileKey: uniqueKey,
    });
  } catch (error) {
    console.error("Presigned URL Generation Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error during signature signing" },
      { status: 500 }
    );
  }
}