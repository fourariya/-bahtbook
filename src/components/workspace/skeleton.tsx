/** Shown while the workspace loads: the shape of the statement and the panels below it. */
export function WorkspaceSkeleton() {
  return (
    <div className="shell grid gap-6 pt-8 pb-12" aria-busy="true">
      <p className="visually-hidden" role="status">
        กำลังโหลดข้อมูล
      </p>
      <div className="skeleton h-9 w-40" />
      <div className="sheet grid gap-4 p-7">
        <div className="skeleton h-5 w-56" />
        <div className="skeleton h-14 w-72 max-w-full" />
        <div className="skeleton h-5 w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="sheet h-80 p-6">
          <div className="skeleton h-full w-full" />
        </div>
        <div className="sheet h-80 p-6">
          <div className="skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}
