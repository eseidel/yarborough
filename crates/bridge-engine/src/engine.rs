use crate::schema::{BidRule, Constraint, System, Variant};
use bridge_core::auction::Auction;
use bridge_core::call::Call;
use bridge_core::hand::Hand;

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

                match rule_match {
                    Some(rule) => {
                        // Use the highest-priority variant's name/description
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
        let rules = self.rules_for_context(auction);
        if rules.is_empty() {
            return None;
        }

        let mut best_match: Option<(Call, Variant)> = None;

        for rule in rules {
            let call = match rule.call.parse::<Call>() {
                Ok(c) => c,
                Err(_) => continue,
            };

            for variant in &rule.variants {
                if self.check_constraints(hand, auction, &variant.constraints) {
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
        // It's an opening bid if there are no existing bids in the auction history.
        // Passes are ignored.
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
    ) -> bool {
        for constraint in constraints {
            if !self.check_constraint(hand, auction, constraint) {
                return false;
            }
        }
        true
    }

    fn check_constraint(&self, hand: &Hand, auction: &Auction, constraint: &Constraint) -> bool {
        match constraint {
            Constraint::MinHCP { min } => hand.hcp() >= *min,
            Constraint::MaxHCP { max } => hand.hcp() <= *max,
            Constraint::MinLength { suit, count } => hand.length(*suit) >= *count,
            Constraint::MaxLength { suit, count } => hand.length(*suit) <= *count,
            Constraint::ExactLength { suit, count } => hand.length(*suit) == *count,
            Constraint::IsBalanced { balanced } => {
                let dist = hand.distribution();
                // Basic check for balanced: 4-3-3-3, 4-4-3-2, 5-3-3-2
                // No voids, no singletons.
                let has_singleton_or_void = dist.iter().any(|&count| count <= 1);
                let doubleton_count = dist.iter().filter(|&&count| count == 2).count();
                let max_suit = dist.iter().max().unwrap_or(&0);

                // Allow 4-3-3-3, 4-4-3-2, 5-3-3-2 (standard)
                // and 5-4-2-2 (semi-balanced)
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
        }
    }
}
