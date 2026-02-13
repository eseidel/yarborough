use bridge_core::rank::Rank;
use bridge_core::suit::Suit;
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_constraint() {
        let yaml = "
type: MinHCP
min: 12
";
        let c: Constraint = serde_yaml::from_str(yaml).expect("Failed to parse");
        assert_eq!(c, Constraint::MinHCP { min: 12 });
    }

    #[test]
    fn test_deserialize_combined_constraints() {
        let yaml = "type: MinCombinedHCP\nmin: 25\n";
        let c: Constraint = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(c, Constraint::MinCombinedHCP { min: 25 });

        let yaml = "type: MinCombinedLength\nsuit: Spades\ncount: 8\n";
        let c: Constraint = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(
            c,
            Constraint::MinCombinedLength {
                suit: Suit::Spades,
                count: 8
            }
        );

        let yaml = "type: AllStopped\n";
        let c: Constraint = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(c, Constraint::AllStopped);

        let yaml = "type: HasStopper\nsuit: Hearts\n";
        let c: Constraint = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(c, Constraint::HasStopper { suit: Suit::Hearts });

        let yaml = "type: NotAlreadyGame\n";
        let c: Constraint = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(c, Constraint::NotAlreadyGame);
    }

    #[test]
    fn test_deserialize_natural_system() {
        let yaml = "
natural:
  - call: '3N'
    variants:
      - name: 'Natural 3NT'
        priority: 5
        description: '25+ combined HCP, all stopped'
        constraints:
          - type: MinCombinedHCP
            min: 25
          - type: AllStopped
";
        let sys: System = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(sys.natural.len(), 1);
        assert_eq!(sys.natural[0].call, "3N");
        assert_eq!(sys.natural[0].variants[0].constraints.len(), 2);
    }

    #[test]
    fn test_merge_natural() {
        let mut sys = System {
            opening: Vec::new(),
            responses: Vec::new(),
            natural: vec![BidRule {
                call: "3N".into(),
                variants: Vec::new(),
            }],
        };
        let other = System {
            opening: Vec::new(),
            responses: Vec::new(),
            natural: vec![BidRule {
                call: "4S".into(),
                variants: Vec::new(),
            }],
        };
        sys.merge(other);
        assert_eq!(sys.natural.len(), 2);
        assert_eq!(sys.natural[1].call, "4S");
    }

    #[test]
    fn test_deserialize_rule() {
        let yaml = "
call: 'P'
variants:
  - name: 'Pass'
    priority: 1
    description: 'Less than 12 HCP'
    constraints:
      - type: MaxHCP
        max: 11
";
        let r: BidRule = serde_yaml::from_str(yaml).unwrap();
        match &r.variants[0].constraints[0] {
            Constraint::MaxHCP { max } => assert_eq!(*max, 11),
            _ => panic!("Wrong variant"),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct System {
    #[serde(default)]
    pub opening: Vec<BidRule>,
    #[serde(default)]
    pub responses: Vec<Situation>,
    #[serde(default)]
    pub natural: Vec<BidRule>,
}

impl System {
    pub fn merge(&mut self, other: System) {
        self.opening.extend(other.opening);
        for other_situation in other.responses {
            if let Some(existing) = self
                .responses
                .iter_mut()
                .find(|s| s.pattern == other_situation.pattern)
            {
                existing.rules.extend(other_situation.rules);
            } else {
                self.responses.push(other_situation);
            }
        }
        self.natural.extend(other.natural);
    }
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct Situation {
    pub pattern: String,
    pub rules: Vec<BidRule>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct BidRule {
    pub call: String,
    pub variants: Vec<Variant>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
pub struct Variant {
    pub name: String,
    pub priority: u8,
    pub description: String,
    pub constraints: Vec<Constraint>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum Constraint {
    MinHCP { min: u8 },
    MaxHCP { max: u8 },
    MinLength { suit: Suit, count: u8 },
    MaxLength { suit: Suit, count: u8 },
    ExactLength { suit: Suit, count: u8 },
    IsBalanced { balanced: bool },
    RuleOfTwenty { met: bool },
    Seat { min: u8, max: u8 },
    RuleOfFifteen { met: bool },
    MinPoints { suit: Option<Suit>, min: u8 },
    MaxPoints { suit: Option<Suit>, max: u8 },
    HasHonor { suit: Suit, rank: Rank },
    MinCombinedHCP { min: u8 },
    MinCombinedLength { suit: Suit, count: u8 },
    HasStopper { suit: Suit },
    AllStopped,
    NotAlreadyGame,
}
