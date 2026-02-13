use crate::inference::{infer_partner, PartnerProfile};
use crate::schema::{BidRule, Constraint, System, Variant};
use bridge_core::auction::Auction;
use bridge_core::call::Call;
use bridge_core::hand::Hand;
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
        let sayc_rules = self.rules_for_context(auction);
        let natural_rules = &self.system.natural;
        let legal_calls = auction.legal_calls();

        legal_calls
            .into_iter()
            .map(|call| {
                let mut best_variant: Option<&Variant> = None;

                for rule in sayc_rules.iter().chain(natural_rules.iter()) {
                    if rule.call.parse::<Call>().ok() == Some(call) {
                        for variant in &rule.variants {
                            if best_variant.is_none()
                                || variant.priority > best_variant.unwrap().priority
                            {
                                best_variant = Some(variant);
                            }
                        }
                    }
                }

                match best_variant {
                    Some(v) => Interpretation {
                        call,
                        rule_name: v.name.clone(),
                        description: v.description.clone(),
                    },
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

        let sayc_rules = self.rules_for_context(auction);
        let natural_rules = &self.system.natural;

        self.find_best_in_rules(
            hand,
            auction,
            sayc_rules.iter().chain(natural_rules.iter()),
            &profile,
        )
    }

    fn find_best_in_rules<'a>(
        &self,
        hand: &Hand,
        auction: &Auction,
        rules: impl Iterator<Item = &'a BidRule>,
        profile: &PartnerProfile,
    ) -> Option<(Call, Variant)> {
        let mut best_match: Option<(Call, Variant)> = None;
        let legal_calls = auction.legal_calls();

        for rule in rules {
            let call = match rule.call.parse::<Call>() {
                Ok(c) => c,
                Err(_) => continue,
            };

            if !legal_calls.contains(&call) {
                continue;
            }

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
            Constraint::NotAlreadyGame => !our_side_has_game(auction),
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

/// Check if our side (the current player's partnership) already has the highest
/// bid at game level or higher in any strain.
fn our_side_has_game(auction: &Auction) -> bool {
    let num_calls = auction.calls.len();
    for (i, call) in auction.calls.iter().enumerate().rev() {
        if let Call::Bid { .. } = call {
            let is_our_side = (i % 2) == (num_calls % 2);
            return is_our_side && call.is_game_bid();
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::board::Position;

    #[test]
    fn test_our_side_has_game_no_bids() {
        let auction = Auction::new(Position::North);
        assert!(!our_side_has_game(&auction));
    }

    #[test]
    fn test_our_side_has_game_3nt() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1N".parse().unwrap()); // North
        auction.add_call(Call::Pass); // East
        auction.add_call("3N".parse().unwrap()); // South
        auction.add_call(Call::Pass); // West
                                      // Current player is North. Our side (North/South) bid 3NT at game.
        assert!(our_side_has_game(&auction));
    }

    #[test]
    fn test_our_side_has_game_4s() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1S".parse().unwrap()); // North
        auction.add_call(Call::Pass);
        auction.add_call("4S".parse().unwrap()); // South
        auction.add_call(Call::Pass);
        assert!(our_side_has_game(&auction));
    }

    #[test]
    fn test_our_side_has_game_opponent_bid() {
        let mut auction = Auction::new(Position::North);
        auction.add_call("1S".parse().unwrap()); // North
        auction.add_call("4H".parse().unwrap()); // East bids 4H (game in Hearts)
                                                 // Current player is South. Last bid is by opponent (East), not our side.
        assert!(!our_side_has_game(&auction));
    }
}
