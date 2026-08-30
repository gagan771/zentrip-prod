"""Internal, citation-backed catalog of what the Zentrip app can do.

These are product facts, not travel facts. Keeping them in the same claim pipeline
means Zenny can answer capability questions without inventing a booking flow.
"""

from datetime import date


CURATED_ON = date(2026, 8, 31)

SOURCES = {
    "product": (
        "Zentrip product capability catalog",
        None,
        "internal",
        "primary",
    ),
}

# (name, city, aliases, source_key, claim, confidence)
ENTRIES = [
    (
        "Train booking handoff",
        "Zentrip",
        ["book a train", "train booking", "rail booking", "IRCTC booking"],
        "product",
        "Zentrip can help compare a train route and open an official booking handoff such as IRCTC, ConfirmTkt, Ixigo Trains, MakeMyTrip Trains, or Goibibo Trains.",
        "verified",
    ),
    (
        "Train booking limits",
        "Zentrip",
        ["does Zentrip book trains", "can Zentrip buy a ticket", "train payment"],
        "product",
        "Zentrip does not take payment, hold a seat, or claim that a train ticket is booked; checkout, availability, passenger details, and refunds are completed on the selected provider's official site.",
        "verified",
    ),
    (
        "Transport comparison",
        "Zentrip",
        ["compare transport", "compare fares", "travel options"],
        "product",
        "The Compare flow currently supports train, bus, flight, and cab route handoffs, with demo corridor estimates for Delhi, Agra, and Jaipur and live availability checked on provider sites.",
        "verified",
    ),
    (
        "Stay booking handoff",
        "Zentrip",
        ["hotel booking", "hostel booking", "book a stay"],
        "product",
        "Zentrip can show a stay comparison preview and open MakeMyTrip, Goibibo, Booking.com, Agoda, Airbnb, or Hostelworld for live search and checkout.",
        "verified",
    ),
    (
        "Trip timeline",
        "Zentrip",
        ["save booking", "trip bookings", "journey timeline"],
        "product",
        "A traveler can keep itinerary and booking or provider-handoff records in the Trip timeline; the external provider remains responsible for the final reservation.",
        "verified",
    ),
    (
        "Zenny voice modes",
        "Zentrip",
        ["live voice", "voice agent", "Expo Go voice"],
        "product",
        "Expo Go uses tap-to-talk voice turns; true always-listening duplex voice requires the custom native development build because Expo Go does not include Zentrip's native PCM streaming module.",
        "verified",
    ),
    (
        "Grocery handoff",
        "Zentrip",
        ["buy groceries", "travel essentials", "toothpaste delivery"],
        "product",
        "Zenny can turn a request for travel essentials into a grocery handoff to Blinkit, Flipkart Minutes, Zepto, or Swiggy Instamart after the traveler confirms.",
        "verified",
    ),
    (
        "Travel guide",
        "Zentrip",
        ["monument guide", "place history", "opening hours"],
        "product",
        "Zenny can answer from reviewed destination claims and operational place observations, and it can check an allowlisted official place page live for time-sensitive opening-hours questions.",
        "verified",
    ),
]
