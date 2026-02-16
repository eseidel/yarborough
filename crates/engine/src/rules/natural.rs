use crate::bidding_rule;
use crate::dsl::auction_predicates::{PartnerLimited, WeOpened};
use crate::dsl::call_predicates::{
    not_call, BidderHasShownSuit, IsJump, IsLevel, IsMajorSuit, IsMinorSuit, IsNewSuit, IsNotrump,
    IsPass, IsSuit, MinLevel, PartnerHasShownSuit,
};
use crate::dsl::shows::{
    ShowBetterContractIsRemote, ShowMinHcp, ShowMinSuitLength, ShowSemiBalanced,
    ShowSufficientValues, ShowSupportLength, ShowSupportValues,
};

bidding_rule! {
    NewSuitAtLevelOne: "New Suit",
    auction: [WeOpened],
    call: [IsLevel(1), IsNewSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(6)]
}

bidding_rule! {
    OneNotrumpResponse: "1NT Response",
    auction: [WeOpened],
    call: [IsLevel(1), IsNotrump],
    shows: [ShowMinHcp(6)]
}

bidding_rule! {
    NewMajorAtLevelTwo: "New Major",
    auction: [WeOpened],
    call: [IsLevel(2), not_call(IsJump), IsNewSuit, IsMajorSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(10)]
}

bidding_rule! {
    NewMinorAtLevelTwo: "New Minor",
    auction: [WeOpened],
    call: [IsLevel(2), not_call(IsJump), IsNewSuit, IsMinorSuit],
    shows: [ShowMinSuitLength(4), ShowMinHcp(10)]
}

bidding_rule! {
    JumpShiftResponse: "Jump Shift Response",
    auction: [WeOpened],
    call: [IsJump, IsNewSuit],
    shows: [ShowMinSuitLength(5), ShowMinHcp(19)]
}

bidding_rule! {
    SupportPartner: "Support Partner",
    auction: [WeOpened],
    call: [IsSuit, PartnerHasShownSuit],
    shows: [ShowSupportLength, ShowSupportValues]
}

bidding_rule! {
    NaturalNotrump: "Natural Notrump",
    auction: [WeOpened],
    call: [MinLevel(2), IsNotrump],
    shows: [ShowSemiBalanced, ShowSufficientValues]
}

bidding_rule! {
    RebidOwnSuit: "Rebid Suit",
    auction: [WeOpened],
    call: [IsSuit, not_call(PartnerHasShownSuit), BidderHasShownSuit],
    shows: [ShowMinSuitLength(6), ShowSufficientValues]
}

bidding_rule! {
    BetterContractRemote: "Pass (Better Contract Remote)",
    auction: [WeOpened, PartnerLimited],
    call: [IsPass],
    shows: [ShowBetterContractIsRemote]
}
