use crate::bidding_rule;
use crate::dsl::auction_predicates::{IsOpen, PartnerLimited};
use crate::dsl::call_predicates::{
    not_call, BidderHasShownSuit, IsNewSuit, IsPass, IsStrain, IsSuit, PartnerHasShownSuit,
};
use crate::dsl::shows::{
    ShowBetterContractIsRemote, ShowMinSuitLength, ShowSemiBalanced, ShowSufficientValues,
    ShowSupportLength,
};
use bridge_core::Strain;

bidding_rule! {
    struct NewSuitDiscovery;
    name: format_strain!("{strain} Discovery"),
    description: format_strain!("Showing 4+ cards in {strain}"),
    auction: [IsOpen],
    call: [IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowSufficientValues]
}

bidding_rule! {
    struct NoTrumpResponse;
    name: format!("{level}{strain} Limit"),
    description: "Limit bid in NT",
    auction: [IsOpen],
    call: [IsStrain(Strain::NoTrump)],
    shows: [ShowSemiBalanced, ShowSufficientValues]
}

bidding_rule! {
    struct SupportResponse;
    name: format_strain!("{strain} Support"),
    description: format_strain!("Support for partner's {strain}"),
    auction: [IsOpen],
    call: [IsSuit, PartnerHasShownSuit],
    shows: [ShowSupportLength, ShowSufficientValues]
}

bidding_rule! {
    struct RebidResponse;
    name: format_strain!("{strain} Rebid"),
    description: format_strain!("Rebid own {strain}"),
    auction: [IsOpen],
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
    auction: [IsOpen, PartnerLimited],
    call: [IsPass],
    shows: [ShowBetterContractIsRemote]
}
