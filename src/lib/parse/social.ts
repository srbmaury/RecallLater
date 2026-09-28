// Patterns for the chrome and captions of social posts (Instagram, X, YouTube).

/** "taste.bangalore", "@weekendroutes": an account name, never the subject of a post. */
export const HANDLE = /^@\S+$|^[a-z0-9_]+[._][a-z0-9._]+$/;
/** "2,431 likes", "1.2k views". */
export const ENGAGEMENT = /^[\d,.]+[km]?\s+(?:likes?|views?|followers?|comments?|shares?)$/i;
/** A caption naming the place: "New opening: Cedar & Bean, …", "next trip: Space & Science Centre, …". */
export const NAMED_IN_CAPTION =
  /\b(?:new opening|now open|just opened|opening soon|new (?:caf[eé]|restaurant|bakery|spot)|(?:your )?next trip|must visit|bucket list)\s*[:\-–]\s*([A-Z][\w&'’. ]{1,40}?)(?=[,.\n]|$)/i;
