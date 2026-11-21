# Storefront assets

## Current collection — 20 November 2026

The active catalog now has 10 products across Ready to eat, Ready to mix, Coffee and Snacks. Dry fruits and the previous Idli listing are hidden. MTR/Orkla official packet references were added for Rava Idli Mix, Gulab Jamun Mix and Bisibele Bath. Organic Mandya official package references replace the Chakli, Nippat and Kodbale photos. Sources are declared in backend/src/modules/catalog/current-collection.ts. All six new images were resized to WebP in memory, stored privately in S3 and checksum-verified; no local image copies were created.

Branded images remain reference packaging, not proof of Ondu Packet brand ownership, product weights, ingredients or claims. Credit records retain the source product URL and rights-holder notice. The older assets described below are retained as history or secondary photos.

Cards and category images now load only near the viewport. The homepage hero and main product-detail image stay eager, preserving their initial load. Package images use contain sizing and fixed card image areas to avoid label cropping and layout shifts. The grid reveals 8 products per batch with an automatic sentinel and an accessible Load more fallback.

## Current package references

At the user request, Upma, Poha, Idli and Pongal now use MTR packet photos from the official Orkla store, and Filter Coffee uses a packed Cothas Speciality Blend powder photo from the official Cothas store. Five WebPs were converted in memory and checksum-verified in private S3. Original food photographs remain as secondary images. Package photos use contain sizing to preserve pack labels.

These are third-party branded reference packaging images, not Ondu Packet branded packs or a claim that the selected demo variants match printed pack weights. They are marked with reference captions on product cards, the hero and product details. The public photo-credits page includes original product-page links and rights-holder notices; these five photographs are not Creative Commons licensed. The repeat-safe import is npm --prefix backend run images:packages.

## Food photography archive and remaining product photos

The active storefront uses 16 Wikimedia Commons food photographs, one per product, streamed from private S3 via /media/product-<hash>. No downloaded image files are kept locally. Photos total 2,834,574 bytes after in-memory WebP conversion. The homepage uses Upma for its hero, Filter Coffee for the story, and database category image references for the four tiles. These are serving suggestions, not photos of actual packaging.

Attribution is stored with each MongoDB mediaassets record and displayed on /photo-credits, linked from the footer. Each photographer is credited with the original source and license link. Responsive crops and WebP conversion are disclosed; the individual photographs retain their original licenses. Source metadata is tracked in backend/src/scripts/food-photo-sources.json.

The Kannada copy uses locally served Noto Sans Kannada regular/medium from the official Google Fonts distribution, with its SIL OFL in frontend/public/fonts/NotoSansKannada-OFL.txt. English names remain alongside Kannada accents.

## Archived generated assets

The following generated assets are retained in S3 for history and are no longer used by the current homepage or product/category fallback.

These original illustrative food assets were made with the built-in image-generation tool and have now been migrated to private S3. They are category/editorial illustrations, not verified photographs of actual products. Actual catalog `images` take precedence on product cards and detail pages. The header and footer use an open stacked green and yellow text wordmark inspired by the supplied logo; the original artwork remains available from S3 at `/media/brand`. Local source PNGs were removed after cloud checksum and delivery verification.

## Hero

Cloud object: `s3://ecom-ondu-bite/ondu-bite/storefront/hero-<content-hash>.webp`. The exact active key and SHA-256 are in MongoDB `mediaassets`, record `name: hero`. Browser path: `/media/hero`.

Final prompt:

> Use case: photorealistic-natural. Asset type: original ecommerce hero photograph, landscape 3:2. A warm editorial food still life for a modern Indian pantry store. Overhead and slightly angled close view of a generous golden brass bowl heaped with natural almonds, cashews and pistachios, a smaller ceramic dish of dates and golden raisins, a few pieces of traditional Indian murukku on ivory linen, scattered nuts on a warm pale sandstone surface. A softly folded deep forest-green cotton napkin and a subtle muted yellow surface edge. Authentic natural food textures, afternoon window light, gentle soft shadows, tasteful premium food magazine art direction, abundant but carefully composed, subjects occupy the frame and are suitable for cropping into a rounded rectangle on a storefront. No packages, no text, no lettering, no logos, no hands, no people, no watermark.

## Category strip

Cloud object: `s3://ecom-ondu-bite/ondu-bite/storefront/categories-<content-hash>.webp`. The exact active key and SHA-256 are in MongoDB `mediaassets`, record `name: categories`. Browser path: `/media/categories`. The former design used five equal panels positioned in CSS. WebP conversion happened in memory before upload; Next.js does not keep an optimized image copy on disk.

Final prompt:

> Use case: product-mockup. Asset type: original category food photography strip for an Indian pantry ecommerce site. A very wide landscape image, 3:1 aspect ratio, composed of FIVE EXACTLY EQUAL WIDTH vertical panels side by side, no gaps. Each panel shows one beautiful centered shallow ceramic bowl photographed directly overhead, entirely within its own panel with generous space. From LEFT TO RIGHT: panel 1 a bowl of almonds and cashews on pale sage green; panel 2 a bowl of dates, golden raisins and dried figs on pale peach; panel 3 a bowl of pumpkin and sunflower seeds on pale mint; panel 4 a bowl of golden Indian laddoo and kaju katli sweets on pale butter yellow; panel 5 a bowl of golden murukku and banana chips on pale terracotta pink. Consistent bowl scale and sunlight across all five panels, natural food magazine photography, lovely ingredient textures, soft shadows, clean minimal composition, no text, no logos, no writing, no graphic borders, no watermarks. Each bowl must be centered within its respective one-fifth of the image.

## Typography

DM Sans and Manrope are served locally from `frontend/public/fonts`, downloaded from the official Google Fonts distribution. Their SIL Open Font License files are included beside the fonts. No runtime Google Fonts request is required.

## Design references

Category discovery and food storytelling: [Oorla](https://www.oorla.com/).
Shopping rhythm and quick add: [Sweet Karam Coffee](https://sweetkaramcoffee.in/).
Playful personality: [Must Be Nuts India](https://www.mustbenuts.in/).
Food education: [DryM Foods](https://drymfoods.com/).

The Ondu Packet name and brand reference were supplied by the user. The interface uses logo green #0c8a43, golden yellow #f3b718 and white, with darker green for accessible controls and restrained deep brown #4a2e22 accents. On mobile, the 100px wide wordmark occupies the middle column of a symmetric header grid to remain centered independently of the controls.

## Supplied brand logo

The supplied logo is stored in private S3 as a content-hashed brand WebP. MongoDB mediaassets record name: brand identifies its active key and SHA-256. Browser path: /media/brand. The lossless WebP is 143324 bytes; conversion and checksum verification happened in memory without creating a local image copy. All three registered images total 667766 bytes.
