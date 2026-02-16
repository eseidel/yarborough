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
    auction: [WeOpened],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(6)]
}

bidding_rule! {
    struct OneNotrumpResponse;
    name: "Notrump Response at Level 1",
    auction: [WeOpened],
    call: [IsNoTrump],
    shows: [ShowMinHcp(6)]
}

bidding_rule! {
    struct NewMajorAtLevelTwo;
    name: "New Major at Level Two",
    auction: [WeOpened],
    call: [IsLevel(2), IsNewSuit, IsMajorSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

bidding_rule! {
    struct NewMinorAtLevelTwo;
    name: "New Minor at Level Two",
    auction: [WeOpened],
    call: [IsLevel(2), IsNewSuit, IsMinorSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(10)]
}

bidding_rule! {
    struct SupportPartner;
    name: "Support Partner",
    auction: [WeOpened],
    call: [IsSuit, PartnerHasShownSuit],
    shows: [ShowSupportLength, ShowSupportValues]
}

bidding_rule! {
    struct NaturalNotrump;
    name: "Natural Notrump",
    auction: [WeOpened],
    call: [MinLevel(2), IsNoTrump],
    shows: [ShowSemiBalanced, ShowSufficientValues]
}

bidding_rule! {
    struct RebidOwnSuit;
    name: "Rebid Own Suit",
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
    auction: [WeOpened, PartnerLimited],
    call: [IsPass],
    shows: [ShowBetterContractIsRemote]
}
