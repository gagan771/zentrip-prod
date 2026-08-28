export type BookingHandoff = {
  key: string;
  displayName: string;
  category: string;
  url: string;
  live?: boolean;
  note?: string;
};

export type BookingCategory = 'cab' | 'stay' | 'flight' | 'train' | 'bus';

export type BookingBrand = {
  key: string;
  displayName: string;
  shortName: string;
  category: BookingCategory;
  domain: string;
  initials: string;
  color: string;
  homeUrl: string;
};

export const BOOKING_BRANDS: BookingBrand[] = [
  { key: 'uber', displayName: 'Uber', shortName: 'Uber', category: 'cab', domain: 'uber.com', initials: 'U', color: '#000000', homeUrl: 'https://m.uber.com/' },
  { key: 'ola', displayName: 'Ola', shortName: 'Ola', category: 'cab', domain: 'olacabs.com', initials: 'O', color: '#1A1A1A', homeUrl: 'https://book.olacabs.com/' },
  { key: 'rapido', displayName: 'Rapido', shortName: 'Rapido', category: 'cab', domain: 'rapido.bike', initials: 'R', color: '#F5C518', homeUrl: 'https://www.rapido.bike/' },

  { key: 'makemytrip_hotels', displayName: 'MakeMyTrip Hotels', shortName: 'MMT', category: 'stay', domain: 'makemytrip.com', initials: 'M', color: '#EB2026', homeUrl: 'https://www.makemytrip.com/hotels/' },
  { key: 'goibibo_hotels', displayName: 'Goibibo Hotels', shortName: 'Goibibo', category: 'stay', domain: 'goibibo.com', initials: 'G', color: '#F15A22', homeUrl: 'https://www.goibibo.com/hotels/' },
  { key: 'booking_com', displayName: 'Booking.com', shortName: 'Booking', category: 'stay', domain: 'booking.com', initials: 'B', color: '#003580', homeUrl: 'https://www.booking.com/' },
  { key: 'agoda', displayName: 'Agoda', shortName: 'Agoda', category: 'stay', domain: 'agoda.com', initials: 'A', color: '#5C2D91', homeUrl: 'https://www.agoda.com/' },
  { key: 'airbnb', displayName: 'Airbnb', shortName: 'Airbnb', category: 'stay', domain: 'airbnb.co.in', initials: 'Ab', color: '#FF5A5F', homeUrl: 'https://www.airbnb.co.in/' },
  { key: 'hostelworld', displayName: 'Hostelworld', shortName: 'Hostels', category: 'stay', domain: 'hostelworld.com', initials: 'H', color: '#F47920', homeUrl: 'https://www.hostelworld.com/' },

  { key: 'airindia', displayName: 'Air India', shortName: 'Air India', category: 'flight', domain: 'airindia.com', initials: 'AI', color: '#DA2128', homeUrl: 'https://www.airindia.com/' },
  { key: 'indigo', displayName: 'IndiGo', shortName: 'IndiGo', category: 'flight', domain: 'goindigo.in', initials: '6E', color: '#001B94', homeUrl: 'https://www.goindigo.in/' },
  { key: 'spicejet', displayName: 'SpiceJet', shortName: 'SpiceJet', category: 'flight', domain: 'spicejet.com', initials: 'SG', color: '#E31E24', homeUrl: 'https://www.spicejet.com/' },
  { key: 'akasa', displayName: 'Akasa Air', shortName: 'Akasa', category: 'flight', domain: 'akasaair.com', initials: 'QP', color: '#5B2C6F', homeUrl: 'https://www.akasaair.com/' },
  { key: 'makemytrip_flights', displayName: 'MakeMyTrip Flights', shortName: 'MMT', category: 'flight', domain: 'makemytrip.com', initials: 'M', color: '#EB2026', homeUrl: 'https://www.makemytrip.com/flights/' },
  { key: 'goibibo_flights', displayName: 'Goibibo Flights', shortName: 'Goibibo', category: 'flight', domain: 'goibibo.com', initials: 'G', color: '#F15A22', homeUrl: 'https://www.goibibo.com/flights/' },
  { key: 'ixigo_flights', displayName: 'Ixigo Flights', shortName: 'Ixigo', category: 'flight', domain: 'ixigo.com', initials: 'ix', color: '#E4473F', homeUrl: 'https://www.ixigo.com/flights' },
  { key: 'cleartrip_flights', displayName: 'Cleartrip', shortName: 'Cleartrip', category: 'flight', domain: 'cleartrip.com', initials: 'C', color: '#F36C21', homeUrl: 'https://www.cleartrip.com/flights' },
  { key: 'easemytrip_flights', displayName: 'EaseMyTrip', shortName: 'EMT', category: 'flight', domain: 'easemytrip.com', initials: 'E', color: '#E31837', homeUrl: 'https://www.easemytrip.com/' },
  { key: 'yatra_flights', displayName: 'Yatra', shortName: 'Yatra', category: 'flight', domain: 'yatra.com', initials: 'Y', color: '#E31837', homeUrl: 'https://www.yatra.com/' },

  { key: 'irctc', displayName: 'IRCTC', shortName: 'IRCTC', category: 'train', domain: 'irctc.co.in', initials: 'IR', color: '#1B4F9C', homeUrl: 'https://www.irctc.co.in/nget/train-search' },
  { key: 'confirmtkt', displayName: 'ConfirmTkt', shortName: 'ConfirmTkt', category: 'train', domain: 'confirmtkt.com', initials: 'CT', color: '#00A651', homeUrl: 'https://www.confirmtkt.com/' },
  { key: 'ixigo_trains', displayName: 'Ixigo Trains', shortName: 'Ixigo', category: 'train', domain: 'ixigo.com', initials: 'ix', color: '#E4473F', homeUrl: 'https://www.ixigo.com/trains' },
  { key: 'makemytrip_trains', displayName: 'MakeMyTrip Trains', shortName: 'MMT', category: 'train', domain: 'makemytrip.com', initials: 'M', color: '#EB2026', homeUrl: 'https://www.makemytrip.com/railways/' },
  { key: 'goibibo_trains', displayName: 'Goibibo Trains', shortName: 'Goibibo', category: 'train', domain: 'goibibo.com', initials: 'G', color: '#F15A22', homeUrl: 'https://www.goibibo.com/trains/' },

  { key: 'redbus', displayName: 'RedBus', shortName: 'RedBus', category: 'bus', domain: 'redbus.in', initials: 'RB', color: '#D84E55', homeUrl: 'https://www.redbus.in/' },
  { key: 'abhibus', displayName: 'AbhiBus', shortName: 'AbhiBus', category: 'bus', domain: 'abhibus.com', initials: 'AB', color: '#E31E24', homeUrl: 'https://www.abhibus.com/' },
];

export const BOOKING_BRAND_BY_KEY = Object.fromEntries(BOOKING_BRANDS.map((brand) => [brand.key, brand]));

export function brandLogoUri(domain: string) {
  return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
}

export function catalogHandoffs(): BookingHandoff[] {
  return BOOKING_BRANDS.map((brand) => ({
    key: brand.key,
    displayName: brand.displayName,
    category: brand.category,
    url: brand.homeUrl,
    live: true,
    note: 'Checkout happens on the provider site. Zentrip does not take payment.',
  }));
}

export const BOOKING_SECTIONS: Array<{
  id: BookingCategory | 'other';
  title: string;
  subtitle: string;
  icon: string;
  categories: BookingCategory[];
}> = [
  { id: 'cab', title: 'Cabs', subtitle: 'Uber, Ola, Rapido', icon: 'car-outline', categories: ['cab'] },
  { id: 'stay', title: 'Hotels', subtitle: 'MMT, Goibibo, Booking, Agoda, Airbnb', icon: 'bed-outline', categories: ['stay'] },
  { id: 'flight', title: 'Flights', subtitle: 'Air India, IndiGo, SpiceJet, OTAs', icon: 'airplane-outline', categories: ['flight'] },
  { id: 'other', title: 'Trains & buses', subtitle: 'IRCTC, RedBus, AbhiBus and more', icon: 'train-outline', categories: ['train', 'bus'] },
];
