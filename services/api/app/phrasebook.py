"""Offline travel phrasebook for the `translation` intent, per 06-live-language-translator.md.

The spec's full live translator is a Phase 3 camera/mic feature. What the Companion
needs today is the conversational fallback the spec itself describes first: "say this
in Hindi/Tamil/etc." — an offline, curated phrasebook with romanized pronunciation.
Deliberately deterministic and dependency-free: no LLM, no network, works offline,
which is exactly when a traveler asks for a phrase.

Curated entries only — never machine-guess a phrase we don't have; return an honest
miss instead. Languages chosen per the corridor + common domestic tourist origin:
Hindi (default), plus Punjabi/Gujarati/Marathi/Bengali/Tamil/Telugu/Kannada/Malayalam
for travelers from those states.
"""

# phrase_key -> (English canonical, per-language renderings)
# Each rendering is (native-script text, romanized pronunciation).
_PHRASEBOOK: dict[str, tuple[str, dict[str, tuple[str, str]]]] = {
    "thank_you": (
        "Thank you",
        {
            "hindi": ("धन्यवाद", "dhanyavaad"),
            "punjabi": ("ਧੰਨਵਾਦ", "dhanvaad"),
            "gujarati": ("આભાર", "aabhaar"),
            "marathi": ("धन्यवाद", "dhanyawaad"),
            "bengali": ("ধন্যবাদ", "dhonnobad"),
            "tamil": ("நன்றி", "nandri"),
            "telugu": ("ధన్యవాదాలు", "dhanyavaadaalu"),
            "kannada": ("ಧನ್ಯವಾದ", "dhanyavada"),
            "malayalam": ("നന്ദി", "nandi"),
        },
    ),
    "how_much": (
        "How much does this cost?",
        {
            "hindi": ("यह कितने का है?", "yeh kitne ka hai?"),
            "punjabi": ("ਇਹ ਕਿੰਨੇ ਦਾ ਹੈ?", "eh kinne da hai?"),
            "gujarati": ("આ કેટલાનું છે?", "aa ketlanu che?"),
            "marathi": ("याची किंमत किती?", "yaachi kimat kiti?"),
            "bengali": ("এটার দাম কত?", "etar dam koto?"),
            "tamil": ("இது எவ்வளவு விலை?", "idhu evvalavu vilai?"),
            "telugu": ("ఇది ఎంత?", "idi enta?"),
            "kannada": ("ಇದರ ಬೆಲೆ ಎಷ್ಟು?", "idara bele eshtu?"),
            "malayalam": ("ഇത് എത്ര രൂപ?", "ethu ethra roopa?"),
        },
    ),
    "where_toilet": (
        "Where is the toilet?",
        {
            "hindi": ("शौचालय कहाँ है?", "shauchalaya kahan hai?"),
            "punjabi": ("ਬਾਥਰੂਮ ਕਿੱਥੇ ਹੈ?", "bathroom kithe hai?"),
            "gujarati": ("શૌચાલય ક્યાં છે?", "shauchalay kya chhe?"),
            "marathi": ("स्वच्छतागृह कुठे आहे?", "swachhatagruh kuthe aahe?"),
            "bengali": ("টয়লেট কোথায়?", "toilet kothay?"),
            "tamil": ("கழிவறை எங்கே?", "zhivvarai engae?"),
            "telugu": ("మరుగుదొడ్డి ఎక్కడ ఉంది?", "maruguddi ekkada undi?"),
            "kannada": ("ಶೌಚಾಲಯ ಎಲ್ಲಿದೆ?", "shouchaalaya ellide?"),
            "malayalam": ("ഷൗചാലയം എവിടെയാണ്?", "shouchaalayam evideyaanu?"),
        },
    ),
    "too_expensive": (
        "That's too expensive",
        {
            "hindi": ("बहुत महंगा है", "bahut mehnga hai"),
            "punjabi": ("ਬਹੁਤ ਮਹਿੰਗਾ ਹੈ", "bahut mehnga hai"),
            "gujarati": ("ખૂબ મોંઘું છે", "khoo moghun chhe"),
            "marathi": ("खूप महाग आहे", "khoop mahaag aahe"),
            "bengali": ("অনেক বেশি দাম", "onek beshi daam"),
            "tamil": ("மிகவும் விலை அதிகம்", "mikavum vilai adhigam"),
            "telugu": ("చాలా ఖరీదైనది", "chaala khareedainadi"),
            "kannada": ("ತುಂಬಾ ದುಬಾರಿ", "tumba dubaari"),
            "malayalam": ("വളരെ ചെലവേറിയതാണ്", "valare chelaveriyathaanu"),
        },
    ),
    "i_need_help": (
        "I need help",
        {
            "hindi": ("मुझे मदद चाहिए", "mujhe madad chahiye"),
            "punjabi": ("ਮੈਨੂੰ ਮਦਦ ਚਾਹੀਦੀ ਹੈ", "mainu madad chaahidi hai"),
            "gujarati": ("મને મદદ જોઈએ છે", "mane madad joie chhe"),
            "marathi": ("मला मदत हवी आहे", "mala madat havi aahe"),
            "bengali": ("আমার সাহায্য দরকার", "amar shahajjo dorkar"),
            "tamil": ("எனக்கு உதவி வேண்டும்", "enakku udhavi vendum"),
            "telugu": ("నాకు సహాయం కావాలి", "naaku sahaayam kaavaali"),
            "kannada": ("ನನಗೆ ಸಹಾಯ ಬೇಕು", "nanage sahaaya beku"),
            "malayalam": ("എനിക്ക് സഹായം വേണം", "enikku sahaayam venam"),
        },
    ),
    # Traveler-specific: vegetarian food — the single most-asked food question in India.
    "vegetarian_food": (
        "I am vegetarian",
        {
            "hindi": ("मैं शाकाहारी हूँ", "main shaakaahaari hoon"),
            "punjabi": ("ਮੈਂ ਸ਼ਾਕਾਹਾਰੀ ਹਾਂ", "main shaakaahaari haan"),
            "gujarati": ("હું શાકાહારી છું", "hun shaakaahaari chhun"),
            "marathi": ("मी शाकाहारी आहे", "mi shaakaahaari aahe"),
            "bengali": ("আমি নিরামিষভোজী", "ami niraamishbhoji"),
            "tamil": ("நான் சைவ உணவு உண்பவன்", "naan saiva unavu unbhavan"),
            "telugu": ("నేను శాకాహారి", "nenu shaakaahaari"),
            "kannada": ("ನಾನು ಮಾಂಸಾಹಾರಿ ಅಲ್ಲ", "naanu maamsaahaari alla"),
            "malayalam": ("ഞാൻ സസ്യാഹാരിയാണ്", "njaan sasyaahaariyaanu"),
        },
    ),
    "need_water": (
        "I need drinking water",
        {
            "hindi": ("मुझे पीने का पानी चाहिए", "mujhe peene ka paani chahiye"),
            "punjabi": ("ਮੈਨੂੰ ਪੀਣ ਵਾਲਾ ਪਾਣੀ ਚਾਹੀਦਾ ਹੈ", "mainu peen wala paani chaahida hai"),
            "gujarati": ("મને પીવાનું પાણી જોઈએ છે", "mane pivanu paani joie chhe"),
            "marathi": ("मला पिण्याचे पाणी हवे आहे", "mala pinyache paani have aahe"),
            "bengali": ("আমার খাবার পানি দরকার", "amar khabar pani dorkar"),
            "tamil": ("எனக்கு குடிநீர் வேண்டும்", "enakku kudineer vendum"),
            "telugu": ("నాకు తాగునీరు కావాలి", "naaku thaguneeru kaavaali"),
            "kannada": ("ನನಗೆ ಕುಡಿಯುವ ನೀರು ಬೇಕು", "nanage kudiyuva neeru beku"),
            "malayalam": ("എനിക്ക് കുടിവെള്ളം വേണം", "enikku kudivellam venam"),
        },
    ),
    "railway_station": (
        "Where is the railway station?",
        {
            "hindi": ("रेलवे स्टेशन कहाँ है?", "railway station kahan hai?"),
            "punjabi": ("ਰੇਲਵੇ ਸਟੇਸ਼ਨ ਕਿੱਥੇ ਹੈ?", "railway station kithe hai?"),
            "gujarati": ("રેલવે સ્ટેશન ક્યાં છે?", "railway station kya chhe?"),
            "marathi": ("रेल्वे स्टेशन कुठे आहे?", "railway station kuthe aahe?"),
            "bengali": ("রেল স্টেশন কোথায়?", "rail station kothay?"),
            "tamil": ("ரயில் நிலையம் எங்கே?", "rayil nilaiyam engae?"),
            "telugu": ("రైల్వే స్టేషన్ ఎక్కడ ఉంది?", "railway station ekkada undi?"),
            "kannada": ("ರೈಲು ನಿಲ್ದಾಣ ಎಲ್ಲಿದೆ?", "railu nildana ellide?"),
            "malayalam": ("റെയിൽവേ സ്റ്റേഷൻ എവിടെയാണ്?", "railway station evideyaanu?"),
        },
    ),
    "less_spicy": (
        "Please make it less spicy",
        {
            "hindi": ("कृपया कम तीखा बनाइए", "kripaya kam teekha banaaiye"),
            "punjabi": ("ਕਿਰਪਾ ਕਰਕੇ ਘੱਟ ਤਿੱਖਾ ਬਣਾਓ", "kirpa karke ghatt tikha banao"),
            "gujarati": ("કૃપા કરીને ઓછું તીખું બનાવો", "kripaya ochhu tikhu banavo"),
            "marathi": ("कृपया कमी तिखट करा", "kripaya kami tikhat kara"),
            "bengali": ("দয়া করে কম ঝাল রাখুন", "doya kore kom jhal rakhun"),
            "tamil": ("தயவுசெய்து காரம் குறைவாக போடுங்கள்", "thayavu seidhu kaaram kuraivaaga podungal"),
            "telugu": ("దయచేసి తక్కువ కారం పెట్టండి", "dayachesi takkuva kaaram pettandi"),
            "kannada": ("ದಯವಿಟ್ಟು ಕಡಿಮೆ ಖಾರ ಮಾಡಿ", "dayavittu kadime khaara maadi"),
            "malayalam": ("ദയവായി എരിവ് കുറച്ച് വെക്കൂ", "dayavaayi erivu kurachu vekku"),
        },
    ),
}

SUPPORTED_LANGUAGES = sorted({lang for _, langs in _PHRASEBOOK.values() for lang in langs})


def _find_phrase_key(text: str) -> str | None:
    lowered = " ".join(text.lower().split())
    if any(word in lowered for word in ("thank", "thanks")):
        return "thank_you"
    if any(word in lowered for word in ("how much", "cost", "price")):
        return "how_much"
    if any(word in lowered for word in ("toilet", "bathroom", "washroom")):
        return "where_toilet"
    if any(word in lowered for word in ("expensive", "cheaper")):
        return "too_expensive"
    if "help" in lowered:
        return "i_need_help"
    if any(word in lowered for word in ("vegetarian", "veg")):
        return "vegetarian_food"
    if any(word in lowered for word in ("water", "drinking water")):
        return "need_water"
    if any(word in lowered for word in ("station", "train station", "railway")):
        return "railway_station"
    if any(word in lowered for word in ("spicy", "spice", "chili", "chilli")):
        return "less_spicy"
    return None


def translate_phrase_detail(text: str, target: str) -> tuple[str, str, str] | None:
    """Return canonical English, native text, and pronunciation for one known phrase."""
    key = _find_phrase_key(text)
    target = target.casefold().strip()
    if key is None or target not in _PHRASEBOOK[key][1]:
        return None
    english, renderings = _PHRASEBOOK[key]
    native, romanized = renderings[target]
    return english, native, romanized


def translate_phrase(text: str) -> tuple[str | None, str]:
    """Deterministic phrasebook lookup. Returns (reply, language) where reply is None
    on an honest miss (unknown phrase or unsupported language)."""
    lowered = " ".join(text.lower().split())

    target = "hindi"
    for lang in SUPPORTED_LANGUAGES:
        if f"in {lang}" in lowered or f"to {lang}" in lowered:
            target = lang
            break

    key = _find_phrase_key(lowered)
    if key is None:
        return None, target

    english, renderings = _PHRASEBOOK[key]
    native, romanized = renderings[target]
    reply = (
        f"In {target.capitalize()}, \"{english}\" is: {native} "
        f"(say it like: \"{romanized}\")."
    )
    return reply, target


async def _translation_reply(text: str) -> tuple[str, str, list[dict]]:
    """Offline curated phrasebook — no LLM, no network, by design (06 §offline-first)."""
    reply, _lang = translate_phrase(text)
    if reply is None:
        known = ", ".join(sorted({english for english, _ in _PHRASEBOOK.values()}))
        return (
            f"My offline phrasebook covers a few essentials right now: {known}. "
            f"Try 'how do I say thank you in Tamil' — and name the language you want.",
            "estimated",
            [],
        )
    return reply, "verified", []
