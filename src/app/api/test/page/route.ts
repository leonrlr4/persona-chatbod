import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || 'csv-import';
  
  let filePath: string;
  let contentType: string;
  
  switch (page) {
    case 'csv-import':
      filePath = path.join(process.cwd(), 'csv-import-test.html');
      contentType = 'text/html; charset=utf-8';
      break;
    case 'vector':
      filePath = path.join(process.cwd(), 'vector-test.html');
      contentType = 'text/html; charset=utf-8';
      break;
    default:
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return new NextResponse(content, {
      headers: { 'Content-Type': contentType },
    });
  } catch (error) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}