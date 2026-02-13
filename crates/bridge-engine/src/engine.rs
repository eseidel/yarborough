use crate::inference::{infer_partner, PartnerProfile};
use crate::schema::{BidRule, Constraint, System, Variant};
use bridge_core::auction::Auction;
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use bridge_core::strain::Strain;
use bridge_core::suit::Suit;

/// A call paired with the rule name and description from the bidding system.
pub struct Interpretation {
    pub call: Call,
    pub rule_name: String,
    pub description: String,
}

pub struct Engine {
    system: System,
}

impl Engine {
    pub fn new(system: System) -> Self {
        Self { system }
    }

    /// Return interpretations for all legal next calls given the current auction.
    /// Each legal call is paired with its rule name/description if one exists.
    pub fn get_interpretations(&self, auction: &Auction) -> Vec<Interpretation> {
        let rules = self.rules_for_context(auction);
        let legal_calls = auction.legal_calls();

        legal_calls
            .into_iter()
            .map(|call| {
                let rule_match = rules
                    .iter()
                    .find(|r| r.call.parse::<Call>().ok() == Some(call));

                // Also check natural rules
                let natural_match = self
                    .system
                    .natural
                    .iter()
                    .find(|r| r.call.parse::<Call>().ok() == Some(call));

                let best_rule = rule_match.or(natural_match);

                match best_rule {
                    Some(rule) => {
                        let best_variant = rule.variants.iter().max_by_key(|v| v.priority);
                        match best_variant {
                            Some(v) => Interpretation {
                                call,
                                rule_name: v.name.clone(),
                                description: v.description.clone(),
                            },
                            None => Interpretation {
                                call,
                                rule_name: String::new(),
                                description: String::new(),
                            },
                        }
                    }
                    None if call == Call::Pass => Interpretation {
                        call,
                        rule_name: "Pass".into(),
                        description: String::new(),
                    },
                    None => Interpretation {
                        call,
                        rule_name: String::new(),
                        description: String::new(),
                    },
                }
            })
            .collect()
    }

    pub fn get_best_bid(&self, hand: &Hand, auction: &Auction) -> Option<(Call, Variant)> {
        let profile = infer_partner(auction, &self.system, hand);

        // Try SAYC rules first
        let sayc_rules = self.rules_for_context(auction);
        if !sayc_rules.is_empty() {
            // SAYC has rules for this context; use them exclusively.
            // If no SAYC rule matches, the implied default is Pass (return None).
            return self.find_best_in_rules(hand, auction, sayc_rules, &profile);
        }

        // Natural rules are a fallback: only used when no SAYC context exists
        // and the opponents haven't bid (to avoid interfering in competitive auctions)
        if opponents_have_acted(auction) {
            return None;
        }

        let natural_best = self.find_best_in_rules(hand, auction, &self.system.natural, &profile);

        // Filter natural bids: must be legal in the current auction
        natural_best.and_then(|(call, variant)| {
            let legal = auction.legal_calls();
            if legal.contains(&call) {
                Some((call, variant))
            } else {
                None
            }
        })
    }

    fn find_best_in_rules(
        &self,
        hand: &Hand,
        auction: &Auction,
        rules: &[BidRule],
        profile: &PartnerProfile,
    ) -> Option<(Call, Variant)> {
        let mut best_match: Option<(Call, Variant)> = None;

        for rule in rules {
            let call = match rule.call.parse::<Call>() {
                Ok(c) => c,
                Err(_) => continue,
            };

            for variant in &rule.variants {
                if self.check_constraints(hand, auction, &variant.constraints, profile) {
                    let is_better = match &best_match {
                        Some((_, current_best_variant)) => {
                            variant.priority > current_best_variant.priority
                        }
                        None => true,
                    };

                    if is_better {
                        best_match = Some((call, variant.clone()));
                    }
                }
            }
        }
        best_match
    }

    /// Return the rules for the current auction context.
    fn rules_for_context(&self, auction: &Auction) -> &[BidRule] {
        if self.is_opening(auction) {
            return &self.system.opening;
        }

        for situation in &self.system.responses {
            if self.matches_pattern(auction, &situation.pattern) {
                return &situation.rules;
            }
        }

        &[]
    }

    fn is_opening(&self, auction: &Auction) -> bool {
        !auction.calls.iter().any(|c| matches!(c, Call::Bid { .. }))
    }

    fn matches_pattern(&self, auction: &Auction, pattern: &str) -> bool {
        let history_vec: Vec<String> = auction.calls.iter().map(|c| c.render()).collect();

        let history_str = history_vec.join(" ");

        if history_str == pattern {
            return true;
        }

        // If the pattern explicitly expects a leading Pass, we don't generalized by stripping them.
        // Otherwise, strip leading passes from the actual auction history to support 2nd/3rd/4th seat openings.
        if !pattern.starts_with("P ") && pattern != "P" {
            let stripped_history = auction
                .calls
                .iter()
                .skip_while(|c| **c == Call::Pass)
                .map(|c| c.render())
                .collect::<Vec<String>>()
                .join(" ");

            if !stripped_history.is_empty() && stripped_history == pattern {
                return true;
            }
        }

        false
    }

    fn check_constraints(
        &self,
        hand: &Hand,
        auction: &Auction,
        constraints: &[Constraint],
        profile: &PartnerProfile,
    ) -> bool {
        for constraint in constraints {
            if !self.check_constraint(hand, auction, constraint, profile) {
                return false;
            }
        }
        true
    }

    fn check_constraint(
        &self,
        hand: &Hand,
        auction: &Auction,
        constraint: &Constraint,
        profile: &PartnerProfile,
    ) -> bool {
        match constraint {
            Constraint::MinHCP { min } => hand.hcp() >= *min,
            Constraint::MaxHCP { max } => hand.hcp() <= *max,
            Constraint::MinLength { suit, count } => hand.length(*suit) >= *count,
            Constraint::MaxLength { suit, count } => hand.length(*suit) <= *count,
            Constraint::ExactLength { suit, count } => hand.length(*suit) == *count,
            Constraint::IsBalanced { balanced } => {
                let dist = hand.distribution();
                let has_singleton_or_void = dist.iter().any(|&count| count <= 1);
                let doubleton_count = dist.iter().filter(|&&count| count == 2).count();
                let max_suit = dist.iter().max().unwrap_or(&0);

                let is_balanced = !has_singleton_or_void && doubleton_count <= 2 && *max_suit <= 5;

                is_balanced == *balanced
            }
            Constraint::RuleOfTwenty { met } => {
                let mut dist = hand.distribution();
                dist.sort_by(|a, b| b.cmp(a));
                let rule_of_twenty = (hand.hcp() + dist[0] + dist[1]) >= 20;
                rule_of_twenty == *met
            }
            Constraint::Seat { min, max } => {
                let seat = (auction.calls.len() + 1) as u8;
                seat >= *min && seat <= *max
            }
            Constraint::RuleOfFifteen { met } => {
                let rule_of_fifteen =
                    (hand.hcp() + hand.length(bridge_core::suit::Suit::Spades)) >= 15;
                rule_of_fifteen == *met
            }
            Constraint::MinPoints { suit, min } => hand.points(*suit) >= *min,
            Constraint::MaxPoints { suit, max } => hand.points(*suit) <= *max,
            Constraint::HasHonor { suit, rank } => hand
                .cards
                .iter()
                .any(|c| c.suit == *suit && c.rank == *rank),
            Constraint::MinCombinedHCP { min } => {
                let combined = hand.hcp() + profile.min_hcp;
                combined >= *min
            }
            Constraint::MinCombinedLength { suit, count } => {
                let si = suit_index(*suit);
                let combined = hand.length(*suit) + profile.min_length[si];
                combined >= *count
            }
            Constraint::HasStopper { suit } => {
                let si = suit_index(*suit);
                profile.stoppers[si]
            }
            Constraint::AllStopped => profile.stoppers.iter().all(|&s| s),
            Constraint::NotAlreadyGame { strain } => !our_side_has_game(auction, *strain),
        }
    }
}

/// Check if the opponents (odd-parity positions relative to current player) have
/// made a non-pass call (bid, double, or redouble).
fn opponents_have_acted(auction: &Auction) -> bool {
    let num_calls = auction.calls.len();
    for (i, call) in auction.calls.iter().enumerate() {
        let is_opponent = (i % 2) != (num_calls % 2);
        if is_opponent && *call != Call::Pass {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::board::Position;

    #[test]
    fn test_opponents_have_acted_empty() {
        let auction = Auction::new(Position::North);
        assert!(!opponents_have_acted(&auction));
    }

    #[test]
    fn test_opponents_have_acted_our_bids_only() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1H".parse().unwrap()); // North bids
        auction.add_call(Call::Pass); // East passes
                                      // Current player is South (our side). Opponents (East, West) only passed.
        assert!(!opponents_have_acted(&auction));
    }

    #[test]
    fn test_opponents_have_acted_opponent_bid() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1H".parse().unwrap()); // North
        auction.add_call("2C".parse().unwrap()); // East overcalls
                                                 // Current player is South. East (opponent) bid.
        assert!(opponents_have_acted(&auction));
    }

    #[test]
    fn test_opponents_have_acted_opponent_doubled() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1H".parse().unwrap()); // North
        auction.add_call(Call::Double); // East doubles
        assert!(opponents_have_acted(&auction));
    }

    #[test]
    fn test_our_side_has_game_no_bids() {
        let auction = Auction::new(Position::North);
        assert!(!our_side_has_game(&auction, Strain::NoTrump));
    }

    #[test]
    fn test_our_side_has_game_3nt() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1N".parse().unwrap()); // North
        auction.add_call(Call::Pass); // East
        auction.add_call("3N".parse().unwrap()); // South
        auction.add_call(Call::Pass); // West
                                      // Current player is North. Our side (North/South) bid 3NT at game.
        assert!(our_side_has_game(&auction, Strain::NoTrump));
        assert!(!our_side_has_game(&auction, Strain::Spades));
    }

    #[test]
    fn test_our_side_has_game_4s() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1S".parse().unwrap()); // North
        auction.add_call(Call::Pass);
        auction.add_call("4S".parse().unwrap()); // South
        auction.add_call(Call::Pass);
        assert!(our_side_has_game(&auction, Strain::Spades));
        assert!(!our_side_has_game(&auction, Strain::Hearts));
    }

    #[test]
    fn test_our_side_has_game_opponent_bid() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1S".parse().unwrap()); // North
        auction.add_call("4H".parse().unwrap()); // East bids 4H (game in Hearts)
                                                 // Current player is South. Last bid is by opponent (East), not our side.
        assert!(!our_side_has_game(&auction, Strain::Hearts));
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

/// Check if our side (the current player's partnership) already has the highest
/// bid at game level or higher in the given strain.
fn our_side_has_game(auction: &Auction, strain: Strain) -> bool {
    let game_level = match strain {
        Strain::Clubs | Strain::Diamonds => 5,
        Strain::Hearts | Strain::Spades => 4,
        Strain::NoTrump => 3,
    };

    // Find the last bid in the auction
    let num_calls = auction.calls.len();
    for (i, call) in auction.calls.iter().enumerate().rev() {
        if let Call::Bid { level, strain: s } = call {
            // Check if this bid is by our side (same parity as current player)
            let is_our_side = (i % 2) == (num_calls % 2);
            if is_our_side && *s == strain && *level >= game_level {
                return true;
            }
            // Only check the last bid in the auction
            break;
        }
    }

    false
}
