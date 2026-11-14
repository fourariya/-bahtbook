import Link from "next/link";

export default function NotFound() {
  return (
    <main className="desk grid min-h-dvh place-items-center px-4 py-12">
      <div className="sheet max-w-md p-7">
        <h1 className="text-xl">ไม่พบหน้านี้</h1>
        <p className="mt-2 text-sm text-muted">ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว</p>
        <Link href="/" className="btn btn-ink mt-5">
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  );
}
