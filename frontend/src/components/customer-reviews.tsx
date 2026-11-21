'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, MessageSquare, Star } from 'lucide-react';

type CustomerReview = {
  id: string;
  name: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  text: string;
  product: { name: string; slug: string };
};

// Only add reviews that have been approved for public display.
const publishedReviews: readonly CustomerReview[] = [];
const ratingLevels = [5, 4, 3, 2, 1] as const;
const demoReviews: readonly CustomerReview[] = [
  {
    id: 'demo-poha',
    name: 'Demo review',
    rating: 5,
    title: 'An easy breakfast',
    text: 'I’d keep a pack handy for busy mornings. A squeeze of lime and a spoonful of peanuts would make it my own.',
    product: { name: 'Poha', slug: 'poha' },
  },
  {
    id: 'demo-coffee',
    name: 'Demo review',
    rating: 5,
    title: 'Made for a slow morning',
    text: 'I like my filter coffee strong, with just a splash of milk. This would be my pick for a slow weekend.',
    product: { name: 'Filter Coffee', slug: 'filter-coffee' },
  },
  {
    id: 'demo-chakli',
    name: 'Demo review',
    rating: 4,
    title: 'A snack to share',
    text: 'I’d put a bowl out with evening coffee. A smaller pack would be handy for taking to work.',
    product: { name: 'Chakli', slug: 'chakli' },
  },
  {
    id: 'demo-bisibele-bath',
    name: 'Demo review',
    rating: 5,
    title: 'A familiar lunch',
    text: 'I’d serve this with a little ghee and something crunchy on the side. It reminds me of lunch at home.',
    product: { name: 'Bisi Bele Bath', slug: 'bisibele-bath' },
  },
  {
    id: 'demo-rava-idli',
    name: 'Demo review',
    rating: 4,
    title: 'Good with coconut chutney',
    text: 'Rava idli and coconut chutney is a favourite pairing. I’d keep this mix around for weekend breakfasts.',
    product: { name: 'Rava Idli Mix', slug: 'rava-idli-mix' },
  },
];
const isDemo = publishedReviews.length === 0;
const reviews = isDemo ? demoReviews : publishedReviews;

export function CustomerReviews() {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const total = reviews.length;
  const average = total ? reviews.reduce((sum, entry) => sum + entry.rating, 0) / total : null;

  function updateEdges() {
    const list = track.current;
    if (!list) return;
    setEdges({
      start: list.scrollLeft <= 1,
      end: list.scrollLeft + list.clientWidth >= list.scrollWidth - 1,
    });
  }

  useEffect(() => {
    const list = track.current;
    if (!list) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  function scrollReviews(direction: -1 | 1) {
    const list = track.current;
    if (!list) return;
    const first = list.children[0];
    const second = list.children[1];
    if (!first || !second) return;
    const step = second.getBoundingClientRect().left - first.getBoundingClientRect().left;
    list.scrollBy({ left: step * direction });
  }

  return (
    <section className="customer-reviews" aria-labelledby="customer-reviews-heading">
      <div className="container customer-reviews-inner">
        <div className="customer-reviews-summary">
          <h2 id="customer-reviews-heading">Customer reviews</h2>
          {isDemo && <p>Example reviews for this storefront preview.</p>}
          {average !== null ? (
            <>
              <p className="reviews-score">
                <Star fill="currentColor" aria-hidden="true" /> {average.toFixed(1)}{' '}
                <span>out of 5</span>
              </p>
              <p>
                {total} {isDemo ? 'demo reviews' : total === 1 ? 'review' : 'reviews'}
              </p>
              <div className="review-ratings" aria-label="Rating breakdown">
                {ratingLevels.map((rating) => {
                  const count = reviews.filter((entry) => entry.rating === rating).length;
                  return (
                    <div key={rating}>
                      <span>{rating} ★</span>
                      <meter
                        min={0}
                        max={total}
                        value={count}
                        aria-label={`${rating}-star reviews`}
                      />
                      <span>{count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p>Feedback from the Ondu Packet community.</p>
          )}
        </div>
        <div className="customer-reviews-content">
          {total > 0 ? (
            <>
              <ul
                ref={track}
                id="customer-review-track"
                className="customer-review-track"
                aria-label={isDemo ? 'Demo reviews' : 'Published reviews'}
                tabIndex={0}
                onScroll={updateEdges}
              >
                {reviews.map((review) => (
                  <li key={review.id} className="customer-review-card">
                    <div
                      className="customer-review-stars"
                      aria-label={`${review.rating} out of 5 stars`}
                      role="img"
                    >
                      {ratingLevels.map((_, i) => (
                        <Star
                          key={i}
                          size={19}
                          fill={i < review.rating ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <h3>{review.title}</h3>
                    <p>{review.text}</p>
                    <footer>
                      <strong>{review.name}</strong>
                      <Link href={`/products/${review.product.slug}`}>{review.product.name}</Link>
                    </footer>
                  </li>
                ))}
              </ul>
              {total > 1 && (
                <div className="customer-review-nav">
                  <button
                    type="button"
                    disabled={edges.start}
                    onClick={() => scrollReviews(-1)}
                    aria-controls="customer-review-track"
                    aria-label="Previous review"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    disabled={edges.end}
                    onClick={() => scrollReviews(1)}
                    aria-controls="customer-review-track"
                    aria-label="Next review"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="customer-review-card customer-review-empty">
              <MessageSquare size={28} aria-hidden="true" />
              <h3>No reviews yet</h3>
              <p>Customer reviews will appear here once they’re published.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
