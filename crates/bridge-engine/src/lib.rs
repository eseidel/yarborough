use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
pub struct CallInterpretation {
    pub call_name: String,
    pub rule_name: String,
    pub description: String,
}

/// Given a call history string and dealer position, return possible next calls
/// with their interpretations.
///
/// This is a stub — it returns hardcoded data regardless of input.
/// The real bidding engine will replace this logic.
#[wasm_bindgen]
pub fn get_interpretations(calls_string: &str, dealer: &str) -> JsValue {
    let _ = (calls_string, dealer); // suppress unused warnings

    let interpretations = vec![
        CallInterpretation {
            call_name: "Pass".into(),
            rule_name: "Pass".into(),
            description: "Nothing to say".into(),
        },
        CallInterpretation {
            call_name: "1C".into(),
            rule_name: "Opening 1\u{2663}".into(),
            description: "12-21 HCP, 3+ clubs".into(),
        },
        CallInterpretation {
            call_name: "1D".into(),
            rule_name: "Opening 1\u{2666}".into(),
            description: "12-21 HCP, 3+ diamonds".into(),
        },
        CallInterpretation {
            call_name: "1H".into(),
            rule_name: "Opening 1\u{2665}".into(),
            description: "12-21 HCP, 5+ hearts".into(),
        },
        CallInterpretation {
            call_name: "1S".into(),
            rule_name: "Opening 1\u{2660}".into(),
            description: "12-21 HCP, 5+ spades".into(),
        },
        CallInterpretation {
            call_name: "1N".into(),
            rule_name: "Opening 1NT".into(),
            description: "15-17 HCP, balanced".into(),
        },
        CallInterpretation {
            call_name: "2C".into(),
            rule_name: "Strong 2\u{2663}".into(),
            description: "22+ HCP or 9+ tricks".into(),
        },
    ];

    serde_wasm_bindgen::to_value(&interpretations).unwrap()
}
