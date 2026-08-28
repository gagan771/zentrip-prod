/**
 * Offline curated travel phrasebook — mirrors services/api/app/phrasebook.py.
 * Works with zero network; never invents phrases that are not curated.
 */

export type PhraseEntry = {
  english: string;
  native: string;
  pronunciation: string;
};

const PHRASEBOOK: Record<
  string,
  { english: string; langs: Record<string, { native: string; pronunciation: string }> }
> = {
  thank_you: {
    english: 'Thank you',
    langs: {
      hindi: { native: 'धन्यवाद', pronunciation: 'dhanyavaad' },
      tamil: { native: 'நன்றி', pronunciation: 'nandri' },
      punjabi: { native: 'ਧੰਨਵਾਦ', pronunciation: 'dhanvaad' },
      bengali: { native: 'ধন্যবাদ', pronunciation: 'dhonnobad' },
      malayalam: { native: 'നന്ദി', pronunciation: 'nandi' },
    },
  },
  how_much: {
    english: 'How much does this cost?',
    langs: {
      hindi: { native: 'यह कितने का है?', pronunciation: 'yeh kitne ka hai?' },
      tamil: { native: 'இது எவ்வளவு விலை?', pronunciation: 'idhu evvalavu vilai?' },
      punjabi: { native: 'ਇਹ ਕਿੰਨੇ ਦਾ ਹੈ?', pronunciation: 'eh kinne da hai?' },
      bengali: { native: 'এটার দাম কত?', pronunciation: 'etar dam koto?' },
      malayalam: { native: 'ഇത് എത്ര രൂപ?', pronunciation: 'ethu ethra roopa?' },
    },
  },
  where_toilet: {
    english: 'Where is the toilet?',
    langs: {
      hindi: { native: 'शौचालय कहाँ है?', pronunciation: 'shauchalaya kahan hai?' },
      tamil: { native: 'கழிவறை எங்கே?', pronunciation: 'zhivvarai engae?' },
      punjabi: { native: 'ਬਾਥਰੂਮ ਕਿੱਥੇ ਹੈ?', pronunciation: 'bathroom kithe hai?' },
      bengali: { native: 'টয়লেট কোথায়?', pronunciation: 'toilet kothay?' },
      malayalam: { native: 'ഷൗചാലയം എവിടെയാണ്?', pronunciation: 'shouchaalayam evideyaanu?' },
    },
  },
  i_need_help: {
    english: 'I need help',
    langs: {
      hindi: { native: 'मुझे मदद चाहिए', pronunciation: 'mujhe madad chahiye' },
      tamil: { native: 'எனக்கு உதவி வேண்டும்', pronunciation: 'enakku udhavi vendum' },
      punjabi: { native: 'ਮੈਨੂੰ ਮਦਦ ਚਾਹੀਦੀ ਹੈ', pronunciation: 'mainu madad chaahidi hai' },
      bengali: { native: 'আমার সাহায্য দরকার', pronunciation: 'amar shahajjo dorkar' },
      malayalam: { native: 'എനിക്ക് സഹായം വേണം', pronunciation: 'enikku sahaayam venam' },
    },
  },
  vegetarian_food: {
    english: 'I am vegetarian',
    langs: {
      hindi: { native: 'मैं शाकाहारी हूँ', pronunciation: 'main shaakaahaari hoon' },
      tamil: { native: 'நான் சைவ உணவு உண்பவன்', pronunciation: 'naan saiva unavu unbhavan' },
      punjabi: { native: 'ਮੈਂ ਸ਼ਾਕਾਹਾਰੀ ਹਾਂ', pronunciation: 'main shaakaahaari haan' },
      bengali: { native: 'আমি নিরামিষভোজী', pronunciation: 'ami niraamishbhoji' },
      malayalam: { native: 'ഞാൻ സസ്യാഹാരിയാണ്', pronunciation: 'njaan sasyaahaariyaanu' },
    },
  },
  need_water: {
    english: 'I need drinking water',
    langs: {
      hindi: { native: 'मुझे पीने का पानी चाहिए', pronunciation: 'mujhe peene ka paani chahiye' },
      tamil: { native: 'எனக்கு குடிநீர் வேண்டும்', pronunciation: 'enakku kudineer vendum' },
      punjabi: { native: 'ਮੈਨੂੰ ਪੀਣ ਵਾਲਾ ਪਾਣੀ ਚਾਹੀਦਾ ਹੈ', pronunciation: 'mainu peen wala paani chaahida hai' },
      bengali: { native: 'আমার খাবার পানি দরকার', pronunciation: 'amar khabar pani dorkar' },
      malayalam: { native: 'എനിക്ക് കുടിവെള്ളം വേണം', pronunciation: 'enikku kudivellam venam' },
    },
  },
  railway_station: {
    english: 'Where is the railway station?',
    langs: {
      hindi: { native: 'रेलवे स्टेशन कहाँ है?', pronunciation: 'railway station kahan hai?' },
      tamil: { native: 'ரயில் நிலையம் எங்கே?', pronunciation: 'rayil nilaiyam engae?' },
      punjabi: { native: 'ਰੇਲਵੇ ਸਟੇਸ਼ਨ ਕਿੱਥੇ ਹੈ?', pronunciation: 'railway station kithe hai?' },
      bengali: { native: 'রেল স্টেশন কোথায়?', pronunciation: 'rail station kothay?' },
      malayalam: { native: 'റെയിൽവേ സ്റ്റേഷൻ എവിടെയാണ്?', pronunciation: 'railway station evideyaanu?' },
    },
  },
  less_spicy: {
    english: 'Please make it less spicy',
    langs: {
      hindi: { native: 'कृपया कम तीखा बनाइए', pronunciation: 'kripaya kam teekha banaaiye' },
      tamil: { native: 'தயவுசெய்து காரம் குறைவாக போடுங்கள்', pronunciation: 'thayavu seidhu kaaram kuraivaaga podungal' },
      punjabi: { native: 'ਕਿਰਪਾ ਕਰਕੇ ਘੱਟ ਤਿੱਖਾ ਬਣਾਓ', pronunciation: 'kirpa karke ghatt tikha banao' },
      bengali: { native: 'দয়া করে কম ঝাল রাখুন', pronunciation: 'doya kore kom jhal rakhun' },
      malayalam: { native: 'ദയവായി എരിവ് കുറച്ച് വെക്കൂ', pronunciation: 'dayavaayi erivu kurachu vekku' },
    },
  },
  too_expensive: {
    english: "That's too expensive",
    langs: {
      hindi: { native: 'बहुत महंगा है', pronunciation: 'bahut mehnga hai' },
      tamil: { native: 'மிகவும் விலை அதிகம்', pronunciation: 'mikavum vilai adhigam' },
      punjabi: { native: 'ਬਹੁਤ ਮਹਿੰਗਾ ਹੈ', pronunciation: 'bahut mehnga hai' },
      bengali: { native: 'অনেক বেশি দাম', pronunciation: 'onek beshi daam' },
      malayalam: { native: 'വളരെ ചെലവേറിയതാണ്', pronunciation: 'valare chelaveriyathaanu' },
    },
  },
};

function findKey(text: string): string | null {
  const lowered = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/(thank|thanks)/.test(lowered)) return 'thank_you';
  if (/(how much|cost|price)/.test(lowered)) return 'how_much';
  if (/(toilet|bathroom|washroom)/.test(lowered)) return 'where_toilet';
  if (/(expensive|cheaper)/.test(lowered)) return 'too_expensive';
  if (/help/.test(lowered)) return 'i_need_help';
  if (/(vegetarian|veg)/.test(lowered)) return 'vegetarian_food';
  if (/(water|drinking)/.test(lowered)) return 'need_water';
  if (/(station|railway|train)/.test(lowered)) return 'railway_station';
  if (/(spicy|spice|chili|chilli)/.test(lowered)) return 'less_spicy';
  return null;
}

/** Lookup a curated phrase. Returns null for unknown phrases (honest miss). */
export function lookupOfflinePhrase(text: string, targetLanguage: string): PhraseEntry | null {
  const key = findKey(text);
  const lang = targetLanguage.toLowerCase().trim();
  if (!key) return null;
  const entry = PHRASEBOOK[key];
  const rendering = entry?.langs[lang];
  if (!entry || !rendering) return null;
  return {
    english: entry.english,
    native: rendering.native,
    pronunciation: rendering.pronunciation,
  };
}

export const OFFLINE_PHRASE_LIST = Object.values(PHRASEBOOK).map((entry) => entry.english);
