use crate::bidding_rule;
use crate::dsl::annotations::Annotation;
use crate::dsl::auction_predicates::not_auction;
use crate::dsl::auction_predicates::IsNotOpen;
use crate::dsl::auction_predicates::IsSeat;
use crate::dsl::call_predicates::not_call;
use crate::dsl::call_predicates::IsCall;
use crate::dsl::call_predicates::IsLevel;
use crate::dsl::call_predicates::IsPass;
use crate::dsl::call_predicates::IsStrain;
use crate::dsl::call_predicates::IsSuit;
use crate::dsl::call_predicates::MinLevel;
use crate::dsl::planner::RuleOfTwentyPlanner;
use crate::dsl::shows::ShowBalanced;
use crate::dsl::shows::ShowHcpRange;
use crate::dsl::shows::ShowMaxHcp;
use crate::dsl::shows::ShowMinHcp;
use crate::dsl::shows::ShowMinSuitLength;
use crate::dsl::shows::ShowOpeningSuitLength;
use crate::dsl::shows::ShowPreemptLength;
use crate::dsl::shows::ShowRuleOfFifteen;
use crate::dsl::shows::ShowThreeOfTopFiveOrBetter;
use types::Strain;

bidding_rule! {
    Strong2COpening: "Strong 2C Opening",
    auction: [IsNotOpen],
    call: [IsCall(2, Strain::Clubs)],
    shows: [ShowMinHcp(22)]
}

bidding_rule! {
    OneNotrumpOpening: "1NT Opening",
    auction: [IsNotOpen],
    call: [IsCall(1, Strain::Notrump)],
    shows: [ShowHcpRange(15, 17), ShowBalanced],
    annotations: [Annotation::NotrumpSystemsOn]
}

bidding_rule! {
    TwoNotrumpOpening: "2NT Opening",
    auction: [IsNotOpen],
    call: [IsCall(2, Strain::Notrump)],
    shows: [ShowHcpRange(20, 21), ShowBalanced],
    annotations: [Annotation::NotrumpSystemsOn]
}

bidding_rule! {
    SuitedOpening: "Suited Opening",
    auction: [IsNotOpen, not_auction(IsSeat(4))],
    call: [IsLevel(1), IsSuit],
    shows: [ShowOpeningSuitLength, ShowMinHcp(12)],
    planner: RuleOfTwentyPlanner,
}

bidding_rule! {
    FourthSeatSuitedOpening: "Suited Opening (4th Seat)",
    auction: [IsNotOpen, IsSeat(4)],
    call: [IsLevel(1), IsSuit],
    shows: [ShowOpeningSuitLength, ShowRuleOfFifteen]
}

bidding_rule! {
    WeakTwoOpening: "Weak Two Opening",
    auction: [IsNotOpen, not_auction(IsSeat(4))],
    call: [IsLevel(2), IsSuit, not_call(IsStrain(Strain::Clubs))],
    shows: [ShowMinSuitLength(6), ShowHcpRange(5, 10), ShowThreeOfTopFiveOrBetter],
}

bidding_rule! {
    PreemptiveOpening: "Preemptive Opening",
    auction: [IsNotOpen],
    call: [MinLevel(3), IsSuit],
    shows: [ShowPreemptLength, ShowMaxHcp(10), ShowThreeOfTopFiveOrBetter]
}

bidding_rule! {
    PassOpening: "Pass (Opening)",
    auction: [IsNotOpen],
    call: [IsPass],
    shows: []
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::bidding_rule::BiddingRule;
    use crate::kernel::{AuctionModel, HandConstraint};
    use types::{Call, Position, Strain, Suit};

    fn make_auction(calls: &str) -> AuctionModel {
        let auction = types::Auction::bidding(Position::North, calls);
        AuctionModel::from_auction(&auction)
    }

    #[test]
    fn test_opening_1major() {
        let model = make_auction("");
        let call = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        let sem = SuitedOpening.get_semantics(&model, &call).unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 5)));
    }

    #[test]
    fn test_weak_two_short_suit() {
        let model = make_auction("");
        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };
        let sem = WeakTwoOpening.get_semantics(&model, &call).unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 6)));
        assert!(sem
            .shows
            .contains(&HandConstraint::ThreeOfTopFiveOrBetter(Suit::Spades)));
    }
}
