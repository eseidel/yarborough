use crate::bidding_rule;
use crate::dsl::auction_predicates::IsOpen;
use crate::dsl::auction_predicates::PartnerLimited;
use crate::dsl::call_predicates::not_call;
use crate::dsl::call_predicates::BidderHasShownSuit;
use crate::dsl::call_predicates::IsPass;
use crate::dsl::call_predicates::IsStrain;
use crate::dsl::call_predicates::IsSuit;
use crate::dsl::call_predicates::PartnerHasShownSuit;
use crate::dsl::shows::ShowBetterContractIsRemote;
use crate::dsl::shows::ShowMinSuitLength;
use crate::dsl::shows::ShowSemiBalanced;
use crate::dsl::shows::ShowSufficientValues;
use crate::dsl::shows::ShowSupportLength;
use bridge_core::Strain;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::bidding_rule::BiddingRule;
    use crate::nbk::{AuctionModel, HandModel, PartnerModel};
    use bridge_core::{Auction, Call, Distribution, Position, Shape};

    #[test]
    fn test_support_limit_with_fit() {
        let hand_model = HandModel {
            hcp: 8,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                hearts: 4,
                ..Distribution::default()
            },
            min_hcp: Some(13),
            ..Default::default()
        };
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        let auction_model = AuctionModel {
            partner_model,
            auction: {
                let mut a = Auction::new(Position::North);
                a.add_call(Call::Bid {
                    level: 1,
                    strain: Strain::Hearts,
                });
                a
            },
            ..AuctionModel::default()
        };

        let sem = SupportResponse
            .get_semantics(&auction_model, &call)
            .unwrap();
        assert!(hand_model.satisfies_all(sem.shows));
    }

    #[test]
    fn test_notrump_limit_balanced() {
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 3,
                diamonds: 3,
                hearts: 3,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_hcp: Some(10),
            ..Default::default()
        };
        let call = Call::Bid {
            level: 2,
            strain: Strain::NoTrump,
        };
        let auction_model = AuctionModel {
            partner_model,
            auction: {
                let mut a = Auction::new(Position::North);
                a.add_call(Call::Bid {
                    level: 1,
                    strain: Strain::Spades,
                });
                a
            },
            ..AuctionModel::default()
        };
        let semantics = NoTrumpResponse
            .get_semantics(&auction_model, &call)
            .unwrap();
        assert!(hand_model.satisfies_all(semantics.shows));
    }
}
