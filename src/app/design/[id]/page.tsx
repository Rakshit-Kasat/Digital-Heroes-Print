/**
 * /design/[id]: loads one design THROUGH RLS (a customer can only open
 * their own), signs short-lived URLs for its images, and hands everything
 * to the client editor. Reads cookies, so it renders inside Suspense.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog/queries";
import { imagePaths, signedUrl, signedUrls } from "@/lib/storage";
import { serverClient } from "@/lib/supabase/server";
import type { DesignDoc } from "@/lib/design/types";
import type { DesignConfig } from "@/lib/orders/service";
import { Editor } from "./editor";
import type { UploadKind } from "./actions";

export const metadata: Metadata = { title: "Designer", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function DesignPage(props: PageProps<"/design/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6"><div className="h-[60vh] animate-pulse rounded-lg bg-mist" aria-label="Loading the designer" /></div>}>
      <DesignLoader {...props} />
    </Suspense>
  );
}

async function DesignLoader({ params, searchParams }: PageProps<"/design/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const user = await requireUser(`/design/${id}`);
  const supabase = await serverClient();
  const { data: design } = await supabase.from("designs").select("*").eq("id", id).maybeSingle();
  if (!design || design.owner_id !== user.id) notFound();

  const { products, divisions } = await getCatalog();
  const product = products.find((p) => p.id === design.product_id);
  if (!product) notFound();
  const division = divisions.find((d) => d.id === product.division_id);

  const doc = design.doc as DesignDoc | null;
  const [imageUrls, uploadUrl] = await Promise.all([
    signedUrls(imagePaths(doc), 60 * 60),
    design.upload_path ? signedUrl(design.upload_path, 60 * 60) : Promise.resolve(null),
  ]);
  const tab = sp.tab === "upload" ? "upload" : sp.tab === "csv" && product.supports_csv ? "csv" : "design";

  return (
    <Editor
      designId={design.id}
      uid={user.id}
      name={design.name}
      product={product}
      divisionSlug={division?.slug ?? ""}
      initialDoc={doc}
      initialConfig={design.config as DesignConfig}
      initialUpload={design.upload_path ? { path: design.upload_path, kind: design.upload_kind as UploadKind, url: uploadUrl } : null}
      imageUrls={imageUrls}
      startTab={tab}
      cancelled={sp.cancelled === "1"}
    />
  );
}
