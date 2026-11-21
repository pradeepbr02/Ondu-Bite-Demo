import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="container empty-state">
      <h1>A little off the shelf.</h1>
      <p>We couldn’t find this page. Let’s get you back to the good stuff.</p>
      <Link href="/shop" className="button primary">
        Explore the pantry
      </Link>
    </div>
  );
}
