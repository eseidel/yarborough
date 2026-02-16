use crate::bidding_rule;
use crate::dsl::auction_predicates::not_auction;
use crate::dsl::auction_predicates::IsNotOpen;
use crate::dsl::auction_predicates::IsSeat;
use crate::dsl::call_predicates::IsCall;
use crate::dsl::call_predicates::IsLevel;
use crate::dsl::call_predicates::IsPass;
use crate::dsl::call_predicates::IsStrain;
use crate::dsl::call_predicates::IsSuit;
use crate::dsl::call_predicates::MinLevel;
use crate::dsl::call_predicates::NotCall;
use crate::dsl::planner::RuleOfTwentyPlanner;
use crate::dsl::shows::ShowBalanced;
use crate::dsl::shows::ShowHcpRange;
use crate::dsl::shows::ShowMaxHcp;
use crate::dsl::shows::ShowMinHcp;
use crate::dsl::shows::ShowMinSuitLength;
use crate::dsl::shows::ShowOpeningSuitLength;
use crate::dsl::shows::ShowPreemptLength;
use crate::dsl::shows::ShowRuleOfFifteen;
use types::Strain;

bidding_rule! {
    struct Strong2C;
    name: "Strong 2C Opening",
    auction: [IsNotOpen],
    call: [IsCall(2, Strain::Clubs)],
    shows: [ShowMinHcp(22)]
}

bidding_rule! {
    struct OneNoTrumpOpening;
    name: "1NT Opening",
    auction: [IsNotOpen],
    call: [IsCall(1, Strain::NoTrump)],
    shows: [ShowHcpRange(15, 17), ShowBalanced]
}

bidding_rule! {
    struct TwoNoTrumpOpening;
    name: "2NT Opening",
    auction: [IsNotOpen],
    call: [IsCall(2, Strain::NoTrump)],
    shows: [ShowHcpRange(20, 21), ShowBalanced]
}

bidding_rule! {
    struct SuitOpening;
    name: format!("{level}{strain} Opening"),
    auction: [IsNotOpen, not_auction(IsSeat(4))],
    call: [IsLevel(1), IsSuit],
    shows: [ShowOpeningSuitLength, ShowMinHcp(12)],
    planner: RuleOfTwentyPlanner,
}

bidding_rule! {
    struct SuitOpeningFourthSeat;
    name: format!("{level}{strain} Opening (4th Seat)"),
    auction: [IsNotOpen, IsSeat(4)],
    call: [IsLevel(1), IsSuit],
    shows: [ShowOpeningSuitLength, ShowRuleOfFifteen]
}

bidding_rule! {
    struct WeakTwo;
    name: format_strain!("Weak 2{strain}"),
    auction: [IsNotOpen, not_auction(IsSeat(4))],
    call: [IsLevel(2), IsSuit, NotCall(Box::new(IsStrain(Strain::Clubs)))],
    shows: [ShowMinSuitLength(6), ShowHcpRange(5, 10)],
}

bidding_rule! {
    struct Preempt;
    name: format!("Preemptive {level}{strain} Opening"),
    auction: [IsNotOpen],
    call: [MinLevel(3), IsSuit],
    shows: [ShowPreemptLength, ShowMaxHcp(10)]
}

bidding_rule! {
    struct PassOpening;
    name: "Pass (Opening)",
    auction: [IsNotOpen],
    call: [IsPass],
    shows: []
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::bidding_rule::BiddingRule;
    use crate::nbk::{AuctionModel, HandConstraint};
    use types::{Call, Position, Strain, Suit};

    fn make_auction(calls: Vec<Call>) -> AuctionModel {
        let mut auction = types::Auction::new(Position::North);
        for c in calls {
            auction.add_call(c);
        }
        AuctionModel::from_auction(&auction)
    }

    #[test]
    fn test_opening_1major() {
        let model = make_auction(vec![]);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        let sem = SuitOpening.get_semantics(&model, &call).unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 5)));
    }

    #[test]
    fn test_weak_two_short_suit() {
        let model = make_auction(vec![]);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };
        let sem = WeakTwo.get_semantics(&model, &call).unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 6)));
    }
}
