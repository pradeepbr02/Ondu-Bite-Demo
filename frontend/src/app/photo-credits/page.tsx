import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
export const metadata: Metadata = { title: 'Photo credits' };
type Credit = {
  path: string;
  title: string;
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  changes: string;
};
export default async function Page() {
  let credits: Credit[] = [];
  let failed = false;
  try {
    const response = await fetch(
      `${process.env.BACKEND_URL ?? 'http://127.0.0.1:4000'}/api/v1/media/credits`,
      { cache: 'no-store', signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw new Error('Unavailable');
    credits = (await response.json()).data;
  } catch {
    failed = true;
  }
  return (
    <section className="container section photo-credits">
      <div className="eyebrow">THE PEOPLE BEHIND THE PICTURES</div>
      <h1>Good food. Good photography.</h1>
      <p>
        Food photographs are credited below. Wikimedia Commons images retain their listed licenses.
        MTR/Orkla, Cothas and Organic Mandya product photographs are reference packaging for this
        preview; their branding and imagery belong to the respective owners and are not Ondu Packet
        packaging.
      </p>
      <p>
        Photos are resized and converted to WebP, and cropped to fit the layout. Creative Commons
        licenses apply only to the photographs marked with those licenses. Branded packaging
        references are not offered under a Creative Commons license.
      </p>
      {failed ? (
        <p role="alert">Photo credits are temporarily unavailable. Please refresh to try again.</p>
      ) : (
        <div className="photo-credit-grid">
          {credits.map((c) => (
            <article className="photo-credit" key={c.path}>
              <Image src={c.path} alt={c.title} width={160} height={120} />
              <div>
                <h2>{c.title}</h2>
                <p>Photo by {c.author}</p>
                <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                  Original source
                </a>
                <span> · </span>
                <a href={c.licenseUrl} target="_blank" rel="noreferrer">
                  {c.license}
                </a>
                <p>{c.changes}</p>
                <a href={c.path}>View our resized photo</a>
              </div>
            </article>
          ))}
        </div>
      )}
      <Link className="button secondary" href="/shop">
        Back to the pantry
      </Link>
    </section>
  );
}
