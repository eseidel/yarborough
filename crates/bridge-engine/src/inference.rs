use bridge_core::auction::Auction;
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use bridge_core::rank::Rank;
use bridge_core::strain::Strain;
use bridge_core::suit::Suit;

use crate::schema::{Constraint, System};

/// Inferred information about partner's hand based on their calls in the auction.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PartnerProfile {
    pub min_hcp: u8,
    pub max_hcp: u8,
    pub min_length: [u8; 4],
    pub stoppers: [bool; 4],
}

impl Default for PartnerProfile {
    fn default() -> Self {
        Self {
            min_hcp: 0,
            max_hcp: 40,
            min_length: [0; 4],
            stoppers: [false; 4],
        }
    }
}

fn suit_index(suit: Suit) -> usize {
    match suit {
        Suit::Clubs => 0,
        Suit::Diamonds => 1,
        Suit::Hearts => 2,
        Suit::Spades => 3,
    }
}

/// Returns the strain of a Call::Bid, if it has one.
fn bid_suit(call: &Call) -> Option<Suit> {
    match call {
        Call::Bid { strain, .. } => match strain {
            Strain::Clubs => Some(Suit::Clubs),
            Strain::Diamonds => Some(Suit::Diamonds),
            Strain::Hearts => Some(Suit::Hearts),
            Strain::Spades => Some(Suit::Spades),
            Strain::NoTrump => None,
        },
        _ => None,
    }
}

/// Build a PartnerProfile by examining partner's calls and the applicable rules.
pub fn infer_partner(auction: &Auction, system: &System, hand: &Hand) -> PartnerProfile {
    let mut profile = PartnerProfile::default();

    let num_calls = auction.calls.len();
    if num_calls < 2 {
        return profile;
    }

    // Partner's calls are at positions: num_calls - 2, num_calls - 4, etc.
    let mut partner_call_indices: Vec<usize> = Vec::new();
    let mut idx = num_calls as isize - 2;
    while idx >= 0 {
        partner_call_indices.push(idx as usize);
        idx -= 4;
    }
    partner_call_indices.reverse();

    for &call_idx in &partner_call_indices {
        let partner_call = &auction.calls[call_idx];

        // Find the rules that could apply to this call
        let applicable_rules = find_rules_for_call(auction, call_idx, system);

        if applicable_rules.is_empty() {
            continue;
        }

        // To correctly infer information from a call that could match multiple variants,
        // we must find the MINIMUM requirement across ALL matching variants.
        // If a variant doesn't mention HCP, its minimum is 0 and its maximum is 40.
        // If a variant doesn't mention a suit's length, its minimum is 0.
        
        let mut min_hcp = 40;
        let mut max_hcp = 0;
        let mut min_lengths = [40u8; 4]; // Start with high value so min() works
        let mut has_genuine_length = false;

        for constraints in &applicable_rules {
            let mut variant_min_hcp = 0;
            let mut variant_max_hcp = 40;
            let mut variant_min_lengths = [0u8; 4];
            let mut variant_has_genuine_length = false;

            for constraint in *constraints {
                match constraint {
                    Constraint::MinHCP { min } => variant_min_hcp = variant_min_hcp.max(*min),
                    Constraint::MaxHCP { max } => variant_max_hcp = variant_max_hcp.min(*max),
                    Constraint::MinLength { suit, count } => {
                        let si = suit_index(*suit);
                        variant_min_lengths[si] = variant_min_lengths[si].max(*count);
                        if bid_suit(partner_call) == Some(*suit) {
                            variant_has_genuine_length = true;
                        }
                    }
                    Constraint::ExactLength { suit, count } => {
                        let si = suit_index(*suit);
                        variant_min_lengths[si] = variant_min_lengths[si].max(*count);
                        if bid_suit(partner_call) == Some(*suit) {
                            variant_has_genuine_length = true;
                        }
                    }
                    Constraint::MinCombinedLength { suit, count } => {
                        let si = suit_index(*suit);
                        let hand_len = hand.length(*suit);
                        let partner_min = count.saturating_sub(hand_len);
                        variant_min_lengths[si] = variant_min_lengths[si].max(partner_min);
                        if bid_suit(partner_call) == Some(*suit) {
                            variant_has_genuine_length = true;
                        }
                    }
                    _ => {}
                }
            }

            min_hcp = min_hcp.min(variant_min_hcp);
            max_hcp = max_hcp.max(variant_max_hcp);
            for i in 0..4 {
                min_lengths[i] = min_lengths[i].min(variant_min_lengths[i]);
            }
            if variant_has_genuine_length {
                has_genuine_length = true;
            }
        }

        profile.min_hcp = profile.min_hcp.max(min_hcp);
        profile.max_hcp = profile.max_hcp.min(max_hcp);
        for i in 0..4 {
            profile.min_length[i] = profile.min_length[i].max(min_lengths[i]);
        }

        if has_genuine_length {
            if let Some(suit) = bid_suit(partner_call) {
                profile.stoppers[suit_index(suit)] = true;
            }
        }

        // If partner passed as first call, cap HCP at 11
        if *partner_call == Call::Pass && call_idx <= 3 && is_opening_position(auction, call_idx) {
            profile.max_hcp = profile.max_hcp.min(11);
        }
    }

    profile
}

/// Check if a position in the auction is an opening position (no prior bids).
fn is_opening_position(auction: &Auction, call_idx: usize) -> bool {
    !auction.calls[..call_idx]
        .iter()
        .any(|c| matches!(c, Call::Bid { .. }))
}

/// Check if hand has a stopper in the given suit (A, K, or Q+J).
pub fn has_stopper_in_hand(hand: &Hand, suit: Suit) -> bool {
    let has_ace = hand
        .cards
        .iter()
        .any(|c| c.suit == suit && c.rank == Rank::Ace);
    let has_king = hand
        .cards
        .iter()
        .any(|c| c.suit == suit && c.rank == Rank::King);
    let has_queen = hand
        .cards
        .iter()
        .any(|c| c.suit == suit && c.rank == Rank::Queen);
    let has_jack = hand
        .cards
        .iter()
        .any(|c| c.suit == suit && c.rank == Rank::Jack);

    has_ace || has_king || (has_queen && has_jack)
}

/// Find the constraint sets from rules that could apply to a call at a given position.
fn find_rules_for_call<'a>(
    auction: &Auction,
    call_idx: usize,
    system: &'a System,
) -> Vec<&'a [Constraint]> {
    let call = &auction.calls[call_idx];
    let call_str = call.render();
    let mut result = Vec::new();

    // Check if this was an opening bid (no prior bids)
    if is_opening_position(auction, call_idx) {
        for rule in &system.opening {
            if rule.call == call_str {
                for variant in &rule.variants {
                    result.push(variant.constraints.as_slice());
                }
            }
        }
        return result;
    }

    // Check response rules by matching pattern against the auction up to this point
    let history: Vec<String> = auction.calls[..call_idx]
        .iter()
        .map(|c| c.render())
        .collect();
    let history_str = history.join(" ");

    // Also try with leading passes stripped
    let stripped_history: String = auction.calls[..call_idx]
        .iter()
        .skip_while(|c| **c == Call::Pass)
        .map(|c| c.render())
        .collect::<Vec<String>>()
        .join(" ");

    for situation in &system.responses {
        if situation.pattern == history_str
            || (!situation.pattern.starts_with("P ") && situation.pattern == stripped_history)
        {
            for rule in &situation.rules {
                if rule.call == call_str {
                    for variant in &rule.variants {
                        result.push(variant.constraints.as_slice());
                    }
                }
            }
        }
    }

    result
}

#[cfg(test)]
pub(crate) fn load_system() -> System {
    let shards = [
        include_str!("rules/openings.yaml"),
        include_str!("rules/notrump/stayman.yaml"),
        include_str!("rules/notrump/jacoby.yaml"),
        include_str!("rules/notrump/responses.yaml"),
        include_str!("rules/majors/raises.yaml"),
        include_str!("rules/majors/jacoby_2nt.yaml"),
        include_str!("rules/majors/responses.yaml"),
        include_str!("rules/majors/rebids.yaml"),
        include_str!("rules/minors/raises.yaml"),
        include_str!("rules/minors/responses.yaml"),
        include_str!("rules/minors/rebids.yaml"),
        include_str!("rules/preemptive/responses.yaml"),
        include_str!("rules/strong/responses.yaml"),
    ];

    let mut system = System {
        opening: Vec::new(),
        responses: Vec::new(),
        natural: Vec::new(),
    };

    for shard in shards {
        let partial: System = serde_yaml::from_str(shard).expect("Failed to parse");
        system.merge(partial);
    }

    system
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::board::Position;
    use bridge_core::card::Card;

    fn make_hand(spades: &str, hearts: &str, diamonds: &str, clubs: &str) -> Hand {
        let mut cards = Vec::new();
        for (suit, ranks) in [
            (Suit::Spades, spades),
            (Suit::Hearts, hearts),
            (Suit::Diamonds, diamonds),
            (Suit::Clubs, clubs),
        ] {
            for c in ranks.chars() {
                if let Some(rank) = Rank::from_char(c) {
                    cards.push(Card { suit, rank });
                }
            }
        }
        Hand { cards }
    }

    #[test]
    fn test_infer_partner_opening_1h() {
        let system = load_system();
        // Partner opened 1H, then opponent passed. It's our turn.
        let mut auction = Auction::new(Position::North);
        auction.add_call("1H".parse().unwrap()); // North opens 1H
        auction.add_call(Call::Pass); // East passes

        // Our hand (South) - doesn't matter much for partner inference
        let hand = make_hand("KQ32", "J2", "A987", "543");
        let profile = infer_partner(&auction, &system, &hand);

        // Partner opened 1H: Rule of 20, 5+ Hearts.
        // The minimum MinHCP across opening 1H variants is 10 (3rd seat light).
        // But since the min across all variants including non-seat-restricted ones is
        // actually 0 (RuleOfTwenty doesn't have MinHCP), the inference picks up
        // the minimum MinHCP found.
        // The 5+ hearts should be inferred.
        assert!(profile.min_length[2] >= 5); // Hearts index = 2
        assert!(profile.stoppers[2]); // Hearts is a genuine bid → stopper
    }

    #[test]
    fn test_infer_partner_opening_1nt() {
        let system = load_system();
        let mut auction = Auction::new(Position::North);
        auction.add_call("1N".parse().unwrap()); // North opens 1NT
        auction.add_call(Call::Pass); // East passes

        let hand = make_hand("KQ32", "J2", "A987", "543");
        let profile = infer_partner(&auction, &system, &hand);

        // Partner opened 1NT: 15-17 HCP, balanced
        assert!(profile.min_hcp >= 15);
        assert!(profile.max_hcp <= 17);
    }

    #[test]
    fn test_infer_partner_passed() {
        let system = load_system();
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Pass); // North passes
        auction.add_call(Call::Pass); // East passes

        let hand = make_hand("KQ32", "J2", "A987", "543");
        let profile = infer_partner(&auction, &system, &hand);

        // Partner passed in opening position: max 11 HCP
        assert!(profile.max_hcp <= 11);
    }

    #[test]
    fn test_stopper_in_hand() {
        let hand = make_hand("AJ32", "QJ2", "9876", "543");
        assert!(has_stopper_in_hand(&hand, Suit::Spades)); // Has Ace
        assert!(has_stopper_in_hand(&hand, Suit::Hearts)); // Has Q+J
        assert!(!has_stopper_in_hand(&hand, Suit::Diamonds)); // No stopper
        assert!(!has_stopper_in_hand(&hand, Suit::Clubs)); // No stopper
    }

    #[test]
    fn test_infer_partner_response() {
        let system = load_system();
        // We opened 1H, opponent passed, partner responded 1S, opponent passed.
        let mut auction = Auction::new(Position::North);
        auction.add_call("1H".parse().unwrap()); // North opens 1H (us)
        auction.add_call(Call::Pass); // East passes
        auction.add_call("1S".parse().unwrap()); // South responds 1S (partner)
        auction.add_call(Call::Pass); // West passes

        let hand = make_hand("32", "AKJ87", "AQ9", "K54");
        let profile = infer_partner(&auction, &system, &hand);

        // Partner responded 1S to 1H: 6+ points, 4+ Spades
        assert!(profile.min_length[3] >= 4); // Spades index = 3
        assert!(profile.stoppers[3]); // Spades is genuine
    }
    #[test]
    fn test_repro_stayman_bug() {
        let system = load_system();
        // P - P - 1N - P - 2C - P - 2D - P - 2N - P - ?
        let mut auction = Auction::new(Position::South);
        auction.add_call(Call::Pass); // South
        auction.add_call(Call::Pass); // West
        auction.add_call("1N".parse().unwrap()); // North
        auction.add_call(Call::Pass); // East
        auction.add_call("2C".parse().unwrap()); // South
        auction.add_call(Call::Pass); // West
        auction.add_call("2D".parse().unwrap()); // North
        auction.add_call(Call::Pass); // East
        auction.add_call("2N".parse().unwrap()); // South
        auction.add_call(Call::Pass); // West

        // We are North, evaluating South's profile.
        let hand = make_hand("Q64", "AT", "KQ965", "AQ7");
        let profile = infer_partner(&auction, &system, &hand);

        // South bid 2C (Stayman) and then 2N (Invitation).
        // South should NOT be inferred to have 6 Clubs or 5 Diamonds.
        assert!(profile.min_length[0] < 6, "Should not infer 6+ Clubs from Stayman");
        assert!(profile.min_length[1] < 5, "Should not infer 5+ Diamonds from Stayman");
        
        // South's HCP should be around 8-9 based on 2N invitation.
        assert_eq!(profile.min_hcp, 8);
        assert_eq!(profile.max_hcp, 9);
    }
}
