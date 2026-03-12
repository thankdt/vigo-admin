
import { S3Client, PutObjectCommand, PutBucketWebsiteCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import * as mime from "mime-types";
import * as dotenv from "dotenv";

dotenv.config();

const BUCKET_NAME = "vigo-admin";
const REGION = "ap-southeast-1"; // Adjust if needed
const DIST_DIR = path.join(process.cwd(), "out"); // Next.js 'export' output directory

const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
});

async function configureBucketWebsite() {
    const command = new PutBucketWebsiteCommand({
        Bucket: BUCKET_NAME,
        WebsiteConfiguration: {
            IndexDocument: { Suffix: "index.html" },
            ErrorDocument: { Key: "index.html" }, // SPA Fallback: Serve index.html on 404
        },
    });

    try {
        await s3Client.send(command);
        console.log("Configured S3 Bucket Website (SPA Fallback enabled)");
    } catch (error) {
        console.error("Error configuring bucket website:", error);
    }
}

async function uploadFile(filePath: string, s3Key: string) {
    const fileContent = fs.readFileSync(filePath);
    const contentType = mime.lookup(filePath) || "application/octet-stream";

    // Set cache control headers appropriate for static assets vs html
    let cacheControl = "public, max-age=0, must-revalidate"; // HTML files
    if (s3Key.includes("_next/static") || s3Key.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)) {
        cacheControl = "public, max-age=31536000, immutable"; // Hashed assets
    }

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
        CacheControl: cacheControl,
    });

    try {
        await s3Client.send(command);
        console.log(`Uploaded: ${s3Key}`);
    } catch (error) {
        console.error(`Error uploading ${s3Key}:`, error);
    }
}

async function uploadDirectory(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) {
        console.error(`Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Correct join logic for recursive uploads
            const newPrefix = prefix ? `${prefix}/${file}` : file;
            await uploadDirectory(fullPath, newPrefix);
        } else {
            const s3Key = prefix ? `${prefix}/${file}` : file;
            await uploadFile(fullPath, s3Key);
        }
    }
}

async function main() {
    console.log(`Starting upload to s3://${BUCKET_NAME} from ${DIST_DIR}...`);

    // Configure SPA Fallback
    await configureBucketWebsite();

    // Upload content of 'out' directory to root of S3
    await uploadDirectory(DIST_DIR, "");

    console.log("Upload complete!");
}

main().catch(console.error);
