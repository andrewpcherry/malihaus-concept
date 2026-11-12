"""Copy and per-state configuration for the paid-search landing pages.

    /sell-your-house/florida/
    /sell-your-house/ohio/

Rendered by tools/build_landing.py. Shared copy lives in the module level
constants; everything that differs by state lives in STATES.

Accuracy rules for anything added here:
  * No guaranteed offer, price, closing date or timescale.
  * MaliHaus does not buy every property. Say "may", not "will".
  * No fees/commission/closing-cost claims until the business confirms them.
  * No testimonials unless the wording and source have been checked AND the
    review is about selling a property (not the mortgage-service reviews).
  * Markets are "selected areas", never a whole state or a whole county.
"""

ROOT = "https://www.malihaus.com"

BENEFITS = [
    ("Sell in its current condition",
     "No repairs or clear-out needed before we look at it."),
    ("A timeline that works for you",
     "Tell us when you would like to sell and we will discuss what is realistic."),
    ("No obligation to accept",
     "Review your options, then decide for yourself."),
]

FORM_NOTE = ("This is an offer request and a property review, not an instant valuation. "
             "A person at MaliHaus reads every request.")

AFTER_SUBMIT = ("Someone from the MaliHaus team will contact you at the number you provide "
                "to confirm the details of the property.")

TRUST_FACTS = [
    ("A person reviews your property",
     "Every request is read by the MaliHaus team. Nothing on this page produces an automated price."),
    ("Reviewed before any figure is discussed",
     "We look at the condition, the location and the repairs needed before talking about a number."),
    ("Direct purchases close at a title company",
     "When MaliHaus buys a property itself, the sale is completed through a title company."),
    ("Not a listing agreement",
     "Requesting a review does not list your property and there is nothing to sign."),
]

STEPS = [
    ("Tell us about the property",
     "Give us the address and the best way to reach you. It takes a minute or two."),
    ("We review its condition, location and your timeline",
     "Someone from the MaliHaus team contacts you to confirm the details. Depending on the "
     "property, we may ask to inspect it."),
    ("Review your options and decide",
     "We explain the offer or selling route available for your property, if there is one. "
     "You decide whether it works for you."),
]

STEPS_NOTE = ("Submitting the form does not commit you to selling. Nothing is binding unless "
              "you later choose to sign a written agreement.")

SITUATIONS = [
    ("A house that needs repairs",
     "A worn roof, older systems or years of deferred maintenance. Ask for a review before "
     "you spend money on renovations."),
    ("An inherited property",
     "You can ask about a house you have inherited or are helping to settle, including one "
     "that still has belongings in it."),
    ("A rental property",
     "Occupied or between tenants. Tell us about any lease in place so it can be taken into account."),
    ("A vacant house",
     "Reviewed in its current condition, however long it has been empty."),
    ("A move or a preferred selling date",
     "If you have a date in mind, tell us. We will say plainly whether it looks realistic."),
]

WHY_INTRO = [
    "Many buyers have one way of doing things. MaliHaus looks at the property first, then "
    "explains which of three selling routes may be open to you.",
    "The right route depends on the property and on our purchase criteria. Sometimes none of "
    "them fits, and if that is the case we will tell you.",
]

ROUTES = [
    ("A direct purchase",
     "If the property meets our buying criteria after an inspection, MaliHaus may buy it "
     "directly using its own funds."),
    ("Improvements, then an investor partner",
     "For some properties, and only with your written approval, we may complete selected "
     "repairs while the property is under contract and bring in an investor partner to "
     "complete the purchase."),
    ("Exposure to our investor network",
     "We can present the property to investors through a national real estate network, "
     "which can bring interest from beyond your local market."),
]

ROUTES_NOTE = ("No route is guaranteed. MaliHaus does not buy every property, and you are "
               "never obliged to accept what we put in front of you.")

FINAL_H2 = "Start with the address."
FINAL_COPY = ("Tell us about the property and when you would like to sell. We will review it "
              "and explain what is available. There is no pressure and no obligation.")

# Leave empty unless every entry is a checked, attributable review about a
# property sale. The section is not rendered while this list is empty.
# Shape: {"quote": "", "name": "", "source": "", "url": ""}
TESTIMONIALS = []

FOLLOWUP_QUESTIONS = [
    ("propertyType", "Property type",
     ["Single-family house", "Townhouse or duplex", "Condo", "Multi-family (3 or more units)",
      "Mobile or manufactured home", "Vacant land", "Other"]),
    ("condition", "Condition",
     ["Move-in ready", "Needs some updating", "Needs major repairs", "Not sure"]),
    ("timeline", "When would you like to sell?",
     ["As soon as possible", "Within 1 to 3 months", "In 3 to 6 months", "No fixed date"]),
]

US_STATES = [
    ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"),
    ("CA", "California"), ("CO", "Colorado"), ("CT", "Connecticut"), ("DE", "Delaware"),
    ("DC", "District of Columbia"), ("FL", "Florida"), ("GA", "Georgia"), ("HI", "Hawaii"),
    ("ID", "Idaho"), ("IL", "Illinois"), ("IN", "Indiana"), ("IA", "Iowa"), ("KS", "Kansas"),
    ("KY", "Kentucky"), ("LA", "Louisiana"), ("ME", "Maine"), ("MD", "Maryland"),
    ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"), ("MS", "Mississippi"),
    ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"), ("NV", "Nevada"),
    ("NH", "New Hampshire"), ("NJ", "New Jersey"), ("NM", "New Mexico"), ("NY", "New York"),
    ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"), ("OK", "Oklahoma"),
    ("OR", "Oregon"), ("PA", "Pennsylvania"), ("RI", "Rhode Island"), ("SC", "South Carolina"),
    ("SD", "South Dakota"), ("TN", "Tennessee"), ("TX", "Texas"), ("UT", "Utah"),
    ("VT", "Vermont"), ("VA", "Virginia"), ("WA", "Washington"), ("WV", "West Virginia"),
    ("WI", "Wisconsin"), ("WY", "Wyoming"),
]


def _faqs(state_name, area_answer):
    return [
        ("Do I need to repair or clean the property first?",
         "No. We review the property in its current condition. You do not need to make repairs, "
         "clear it out or stage it before we look at it."),
        ("Can I enquire about an inherited house?",
         "Yes. Tell us where things stand, for example whether the estate has been settled. "
         "Who is able to sign a sale depends on the estate, so we may suggest you confirm that "
         "with the attorney or court handling it. We cannot give legal advice."),
        ("Can I enquire about a property with tenants?",
         "Yes. Tenanted properties are reviewed as they are. Let us know whether there is a "
         "lease in place and when it ends, because that affects which options are available."),
        ("How is an offer determined?",
         "We look at the condition of the property, the repairs it needs, its location, what "
         "has sold nearby and which selling route fits. Any figure comes from that review. "
         "This page does not produce an automatic valuation, and an offer is not guaranteed."),
        ("How quickly could a sale happen?",
         "It depends on the property, the title, the route chosen and the people involved, "
         "such as the title company, an investor partner, tenants or an estate. We do not "
         "promise a fixed number of days. If you have a date in mind, tell us and we will be "
         "straightforward about whether it looks realistic."),
        ("Does requesting an offer commit me to selling?",
         "No. Requesting an offer only asks us to review the property and contact you. "
         "Nothing is binding unless you later choose to sign a written agreement."),
        ("Do you buy in my area?", area_answer),
        ("Will MaliHaus buy the property directly?",
         "Sometimes. If the property meets our direct purchase criteria, MaliHaus may buy it "
         "itself. If not, one of the other two routes may apply: selected improvements with an "
         "investor partner, or exposure to our investor network. If none of the three fits, "
         "we will tell you."),
    ]


STATES = {
    "florida": {
        "slug": "florida",
        "state_code": "FL",
        "state_name": "Florida",
        "page_id": "sell-your-house-florida-v1",
        "title": "Sell Your Florida House As-Is | MaliHaus",
        "meta": ("Request an offer on a Florida house in its current condition. MaliHaus reviews "
                 "the property and explains the selling options available in selected areas. "
                 "No obligation to accept."),
        "kicker": "Selected areas in Florida",
        "h1": "Sell Your Florida House As-Is",
        "sub": ("Skip the repairs. Tell us about your property and when you would like to sell. "
                "MaliHaus will review it and explain the selling options available, with no "
                "obligation to accept."),
        "hero_img": "img/markets/broward-county-fl",
        "hero_alt": ("A single storey Florida ranch house with a tile roof, a carport and palm "
                     "trees on an ordinary residential street"),
        "hero_caption": "Representative Florida home. Illustrative image, not a property MaliHaus has purchased.",
        "identity_note": ("Our office is in Boca Raton, Florida. The areas listed on this page "
                          "are places where we review properties, not separate offices."),
        "area_h2": "Selected areas in Florida",
        "area_intro": "We currently review properties in selected areas within these markets:",
        "areas": [
            "Broward County",
            "Palm Beach County",
            "Duval County (Jacksonville)",
            "Hillsborough County (Tampa)",
            "Orange County (Orlando)",
            "Seminole County",
            "Pasco County",
            "Polk County",
        ],
        "area_note": ("We do not cover every address in these counties or every part of "
                      "Florida. Enter the property address and we will check whether it is in "
                      "an area we are currently reviewing. If it is not, we will tell you."),
        "area_img": "img/markets/tampa-fl",
        "area_alt": "A modest older Florida bungalow with a front porch on a quiet residential street",
        "faqs": _faqs(
            "Florida",
            "We review properties in selected areas within Broward, Palm Beach, Duval "
            "(Jacksonville), Hillsborough (Tampa), Orange (Orlando), Seminole, Pasco and Polk "
            "counties. Being in one of those counties does not mean every address qualifies. "
            "Send us the property address and we will confirm whether it is in an area we are "
            "reviewing."),
    },
    "ohio": {
        "slug": "ohio",
        "state_code": "OH",
        "state_name": "Ohio",
        "page_id": "sell-your-house-ohio-v1",
        "title": "Sell Your Ohio House As-Is | MaliHaus",
        "meta": ("Request an offer on an Ohio house in its current condition. MaliHaus reviews "
                 "properties in selected areas around Cleveland, Akron and Dayton and explains "
                 "the selling options available. No obligation to accept."),
        "kicker": "Selected areas around Cleveland, Akron and Dayton",
        "h1": "Sell Your Ohio House As-Is",
        "sub": ("Selling a house that needs work? Managing an inherited or rental property? "
                "Tell MaliHaus about the property and your timeline. We will review the "
                "available selling options with you."),
        "hero_img": "img/markets/cleveland-oh",
        "hero_alt": ("A white two storey house with a full width front porch and a detached "
                     "garage on a tree lined Ohio street in autumn"),
        "hero_caption": "Representative Ohio home. Illustrative image, not a property MaliHaus has purchased.",
        "identity_note": ("Our office is in Boca Raton, Florida. MaliHaus does not have an "
                          "office in Ohio. Ohio requests are handled by the same team."),
        "area_h2": "Selected areas in Ohio",
        "area_intro": "We currently review properties in selected areas around:",
        "areas": [
            "Cleveland",
            "Akron",
            "Dayton and Montgomery County",
        ],
        "area_note": ("We do not cover the whole of Ohio, and a city name on this list does "
                      "not mean every address qualifies. Enter the property address and we "
                      "will check whether it is in an area we are currently reviewing. If it "
                      "is not, we will tell you."),
        "area_img": "img/markets/dayton-oh",
        "area_alt": "A post war Cape Cod style house with dormer windows on a flat Ohio street in winter",
        "faqs": _faqs(
            "Ohio",
            "We review properties in selected areas around Cleveland, Akron, and Dayton and "
            "Montgomery County. We do not cover the whole of Ohio, and being near one of those "
            "cities does not mean every address qualifies. Send us the property address and we "
            "will confirm whether it is in an area we are reviewing."),
    },
}
