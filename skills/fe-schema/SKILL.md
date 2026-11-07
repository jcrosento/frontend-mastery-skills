---
name: fe-schema
description: Expert structured data (schema.org JSON-LD) for websites: Organization, LocalBusiness and its subtypes, TouristTrip, TouristAttraction, LodgingBusiness/Hotel, Product/Offer, Service, FAQPage, BreadcrumbList, Article, Event, Review rules, WebSite/SearchAction, sitelinks and speakable, plus validation and Search Console monitoring. Use when the user asks for schema, structured data, rich results, JSON-LD, local SEO markup or SEO readiness.
license: MIT
metadata:
  author: jcrosento
  version: "0.1.0"
---

# fe-schema

## Principles
- JSON-LD only, one `<script type="application/ld+json">` per page with an `@graph` linking entities by `@id`.
- Use the most specific type available (e.g. `TravelAgency`, `TouristInformationCenter`, `Resort`, `BoatRental` rather than `LocalBusiness`).
- Markup must describe visible page content. NAP (name, address, phone) must match Google Business Profile character for character.
- `aggregateRating`/`review` on your own LocalBusiness only if reviews are shown on the page and follow Google's review snippet rules; never self-serving fabricated ratings.
- Sitewide: `Organization` (logo, sameAs, contactPoint) + `WebSite` (with `SearchAction` if site search exists). Per page: the page type entity + `BreadcrumbList`.

## Page-type map
| Page | Types | Required / key fields |
|------|-------|------------------------|
| Home | Organization or LocalBusiness subtype, WebSite | name, url, logo, address, telephone, geo (5 decimals), openingHoursSpecification, priceRange, image, sameAs |
| Location / branch | LocalBusiness subtype (one per location page) | own address, phone, hours, geo, areaServed for service-area businesses |
| Tour / expedition | TouristTrip + Offer (+ Event if dated departures) | name, description, itinerary (ItemList of TouristAttraction/Place), touristType, offers (price, priceCurrency, availability, url), provider, image |
| Island / destination | TouristAttraction or Place | name, geo, description, image, isAccessibleForFree, touristType |
| Resort / room | Resort or Hotel + HotelRoom / Accommodation + Offer | starRating, checkinTime, checkoutTime, amenityFeature, petsAllowed, occupancy |
| Product (WooCommerce) | Product + Offer (+ AggregateRating if real reviews) | name, image, description, sku, brand, offers.price, priceCurrency, availability, itemCondition |
| Service | Service + Offer, provider -> Organization | serviceType, areaServed, hasOfferCatalog |
| Blog post | Article / BlogPosting | headline, image, datePublished, dateModified, author (Person with url), publisher |
| FAQ | FAQPage (only when Q&A visible on page) | mainEntity Question/acceptedAnswer |
| Contact | ContactPage + Organization contactPoint | telephone, contactType, areaServed, availableLanguage |

## Procedure
1. Crawl existing JSON-LD per template (fe-wp-audit does this for WordPress).
2. Build `design/schema/<page-type>.jsonld` templates with placeholders bound to content fields (Astro frontmatter, ACF/MetaBox fields, WooCommerce data).
3. Implement: Astro -> a `<Schema />` component rendering the graph from content; Bricks -> code element or Rank Math/Yoast schema templates with dynamic data; Elementor -> SEO plugin schema templates.
4. Validate every template URL with Rich Results Test and validator.schema.org; zero errors, review warnings.
5. Monitor Search Console -> Enhancements weekly; log to `design/reports/schema.md`.

## Anti-patterns
- Duplicate Organization blocks from theme + SEO plugin.
- FAQ schema for FAQs not visible on the page.
- Prices without currency or outdated availability.
- `LocalBusiness` with a PO box or an address that differs from the footer.
