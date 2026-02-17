use crate::dsl::auction_predicates::{PartnerLimited, WeOpened};
use crate::dsl::call_predicates::{
    not_call, BidderHasShownSuit, IsJump, IsLevel, IsMajorSuit, IsMinorSuit, IsNewSuit, IsNotrump,
    IsPass, IsSuit, MinLevel, PartnerHasShownSuit,
};
use crate::dsl::shows::{
    ShowBetterContractIsRemote, ShowMinHcp, ShowMinSuitLength, ShowSemiBalanced,
    ShowSufficientValues, ShowSupportLength, ShowSupportValues,
};
use crate::rule;

rule! {
    NewSuitAtLevelOne: "New Suit",
    auction: [WeOpened],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(6)]
}

rule! {
    OneNotrumpResponse: "1NT Response",
    auction: [WeOpened],
    call: [IsLevel(1), IsNotrump],
    shows: [ShowMinHcp(6)]
}

rule! {
    NewMajorAtLevelTwo: "New Major",
    auction: [WeOpened],
    call: [IsLevel(2), not_call(IsJump), IsNewSuit, IsMajorSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

rule! {
    NewMinorAtLevelTwo: "New Minor",
    auction: [WeOpened],
    call: [IsLevel(2), not_call(IsJump), IsNewSuit, IsMinorSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(10)]
}

rule! {
    JumpShiftResponse: "Jump Shift Response",
    auction: [WeOpened],
    call: [IsJump, IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(19)]
}

rule! {
    SupportPartner: "Support Partner",
    auction: [WeOpened],
    call: [IsSuit, PartnerHasShownSuit],
    shows: [ShowSupportLength, ShowSupportValues]
}

rule! {
    NaturalNotrump: "Natural Notrump",
    auction: [WeOpened],
    call: [MinLevel(2), IsNotrump],
    shows: [ShowSemiBalanced, ShowSufficientValues]
}

rule! {
    RebidOwnSuit: "Rebid Suit",
    auction: [WeOpened],
    call: [IsSuit, not_call(PartnerHasShownSuit), BidderHasShownSuit],
    shows: [ShowMinSuitLength(6), ShowSufficientValues]
}

rule! {
    BetterContractRemote: "Pass (Better Contract Remote)",
    auction: [WeOpened, PartnerLimited],
    call: [IsPass],
    shows: [ShowBetterContractIsRemote]
}
