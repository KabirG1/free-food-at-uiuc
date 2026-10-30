// Helpers for the free-text locations clubs type into their listings.

// Locations that are not a place you can walk to, so they get no map link.
const NOT_A_PLACE = /private location|sign in|not listed|online|virtual|zoom|tba|tbd/i;

/** True when OneIllinois hides the location from people who are not signed in. */
export function isPrivateLocation(location: string): boolean {
  return /private location|sign in to display/i.test(location);
}

/** Returns a Google Maps search link for `location` near campus, or null if it is not a real place. */
export function mapLink(location: string): string | null {
  const place = location.trim();
  if (place === "" || NOT_A_PLACE.test(place)) {
    return null;
  }
  const query = encodeURIComponent(`${place}, Urbana-Champaign, IL`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
