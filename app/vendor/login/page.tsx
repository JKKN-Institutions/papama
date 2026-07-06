import { redirect } from "next/navigation";

/**
 * Legacy vendor login → unified /login. Kept as a redirect stub so old links and
 * bookmarks (and the proxy's historical bounce target) never 404. Preserves a
 * same-origin ?redirect so deep-link returns still work after sign-in.
 */
export default async function VendorLoginRedirect({
    searchParams,
}: {
    searchParams: Promise<{ redirect?: string }>;
}) {
    const { redirect: r } = await searchParams;
    const params = new URLSearchParams({ portal: "vendor" });
    if (r && r.startsWith("/") && !r.startsWith("//")) params.set("redirect", r);
    redirect(`/login?${params.toString()}`);
}
