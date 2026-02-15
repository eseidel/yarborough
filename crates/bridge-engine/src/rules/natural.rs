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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dsl::bidding_rule::BiddingRule;
    use crate::nbk::{AuctionModel, HandModel, PartnerModel};
    use bridge_core::{Auction, Call, Distribution, Position, Shape, Strain};

    #[test]
    fn test_no_discovery_without_4_cards() {
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 4,
                diamonds: 3,
                hearts: 3,
                spades: 3,
            },
            shape: Shape::Balanced,
        };
        let diamonds = Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        };
        let clubs = Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        };
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        auction.add_call(Call::Pass);

        let auction_model = AuctionModel::from_auction(&auction, Position::South);

        let diamond_semantics = NewSuitDiscovery.get_semantics(&auction_model, &diamonds);

        if let Some(s) = diamond_semantics {
            assert!(!hand_model.satisfies_all(s.shows));
        }

        let club_semantics = NewSuitDiscovery.get_semantics(&auction_model, &clubs);
        assert!(club_semantics.is_none());
    }

    #[test]
    fn test_discovery_excludes_partner_suits() {
        let hand_model = HandModel {
            hcp: 10,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        let h_bid = Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        };
        let s_bid = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                hearts: 4,
                ..Distribution::default()
            },
            min_hcp: Some(13),
            ..Default::default()
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

        assert!(NewSuitDiscovery
            .get_semantics(&auction_model, &h_bid)
            .is_none());

        let s_semantics = NewSuitDiscovery
            .get_semantics(&auction_model, &s_bid)
            .unwrap();
        assert!(hand_model.satisfies_all(s_semantics.shows));
    }

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
