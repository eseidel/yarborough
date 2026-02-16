use crate::bidding_rule;
use crate::dsl::auction_predicates::{PartnerLimited, WeOpened};
use crate::dsl::call_predicates::{
    not_call, BidderHasShownSuit, IsLevel, IsMajorSuit, IsMinorSuit, IsNewSuit, IsPass, IsStrain,
    IsSuit, PartnerHasShownSuit,
};
use crate::dsl::shows::{
    ShowBetterContractIsRemote, ShowMinHcp, ShowMinSuitLength, ShowSemiBalanced,
    ShowSufficientValues, ShowSupportLength,
};
use bridge_core::Strain;

bidding_rule! {
    struct NewSuitAtLevelOne;
    name: "New Suit at Level One",
    description: "Showing 4+ cards in a new suit",
    auction: [WeOpened],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(6)]
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
    struct NoTrumpResponse;
    name: format!("{level}{strain} Limit"),
    description: "Limit bid in NT",
    auction: [WeOpened],
    call: [IsStrain(Strain::NoTrump)],
    shows: [ShowSemiBalanced, ShowSufficientValues]
}

bidding_rule! {
    struct SupportResponse;
    name: format_strain!("{strain} Support"),
    description: format_strain!("Support for partner's {strain}"),
    auction: [WeOpened],
    call: [IsSuit, PartnerHasShownSuit],
    shows: [ShowSupportLength, ShowSufficientValues]
}

bidding_rule! {
    struct RebidResponse;
    name: format_strain!("{strain} Rebid"),
    description: format_strain!("Rebid own {strain}"),
    auction: [WeOpened],
    call: [
        IsSuit,
        not_call(PartnerHasShownSuit),
        BidderHasShownSuit,
    ],
    shows: [ShowMinSuitLength(6), ShowSufficientValues]
}

bidding_rule! {
    struct PassBetterContractIsRemote;
    name: "Pass (Better Contract Remote)",
    description: "Pass showing no interest in competing further",
    auction: [WeOpened, PartnerLimited],
    call: [IsPass],
    shows: [ShowBetterContractIsRemote]
}
