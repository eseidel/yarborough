use crate::bidding_rule;
use crate::dsl::auction_predicates::{PartnerLimited, WeOpened};
use crate::dsl::call_predicates::{
    not_call, BidderHasShownSuit, IsLevel, IsMajorSuit, IsMinorSuit, IsNewSuit, IsNoTrump, IsPass,
    IsSuit, MinLevel, PartnerHasShownSuit,
};
use crate::dsl::shows::{
    ShowBetterContractIsRemote, ShowMinHcp, ShowMinSuitLength, ShowSemiBalanced,
    ShowSufficientValues, ShowSupportLength, ShowSupportValues,
};

bidding_rule! {
    struct NewSuitAtLevelOne;
    name: "New Suit at Level One",
    description: "Showing 4+ cards in a new suit",
    auction: [WeOpened],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(6)]
}

bidding_rule! {
    struct OneNotrumpResponse;
    name: "Notrump Response at Level 1",
    description: "No more information to convey at this point",
    auction: [WeOpened],
    call: [IsNoTrump],
    shows: [ShowMinHcp(6)]
}

bidding_rule! {
    struct NewMajorAtLevelTwo;
    name: "New Major at Level Two",
    description: "Showing 5+ cards in a new major suit",
    auction: [WeOpened],
    call: [IsLevel(2), IsNewSuit, IsMajorSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

bidding_rule! {
    struct NewMinorAtLevelTwo;
    name: "New Minor at Level Two",
    description: "Showing 4+ cards in a new minor suit",
    auction: [WeOpened],
    call: [IsLevel(2), IsNewSuit, IsMinorSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(10)]
}

bidding_rule! {
    struct SupportPartner;
    name: "Support Partner",
    description: "Showing support for partner's suit",
    auction: [WeOpened],
    call: [IsSuit, PartnerHasShownSuit],
    shows: [ShowSupportLength, ShowSupportValues]
}

bidding_rule! {
    struct NaturalNotrump;
    name: "Natural Notrump",
    description: "Shows values and a semi-balanced hand",
    auction: [WeOpened],
    call: [MinLevel(2), IsNoTrump],
    shows: [ShowSemiBalanced, ShowSufficientValues]
}

bidding_rule! {
    struct RebidOwnSuit;
    name: "Rebid Own Suit",
    description: "Rebid own suit to show length",
    auction: [WeOpened],
    call: [
        IsSuit,
        not_call(PartnerHasShownSuit),
        BidderHasShownSuit,
    ],
    shows: [ShowMinSuitLength(6), ShowSufficientValues]
}

bidding_rule! {
    struct BetterContractRemote;
    name: "Better Contract Remote",
    description: "Pass showing no interest in competing further",
    auction: [WeOpened, PartnerLimited],
    call: [IsPass],
    shows: [ShowBetterContractIsRemote]
}
