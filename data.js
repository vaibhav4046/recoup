window.RO_FALLBACK = {
  "mode": "live",
  "integrations": {
    "gemini": "live",
    "mongodb": "live"
  },
  "scan": {
    "findings": [
      {
        "id": "f_sub_1",
        "kind": "dead_subscription",
        "title": "Cancel Disney+ Premium",
        "cadence": "yearly",
        "amount": 239.88,
        "currency": "$",
        "amount_label": "$240/yr",
        "unit_note": "$19.99/mo",
        "rule": "dead_sub",
        "evidence": "Unused 142 days · billing since 2023-04",
        "action": "cancel",
        "priority": "high",
        "confidence": 0.95,
        "confidence_band": "high",
        "caveat": "Confirm you've truly stopped using it before you cancel.",
        "claim_url": null,
        "odds": "very likely",
        "timeline": "instant–1 billing cycle",
        "agent": "sub_hunter",
        "agent_name": "Subscription Hunter",
        "verify": {
          "ok": true,
          "review": false,
          "needs_confirm": false,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility is auto-confirmable",
              "ok": true
            }
          ],
          "reasons": []
        }
      },
      {
        "id": "f_sub_3",
        "kind": "dead_subscription",
        "title": "Cancel FitPlus Gym App",
        "cadence": "yearly",
        "amount": 179.88,
        "currency": "$",
        "amount_label": "$180/yr",
        "unit_note": "$14.99/mo",
        "rule": "dead_sub",
        "evidence": "Unused 210 days · billing since 2024-02",
        "action": "cancel",
        "priority": "high",
        "confidence": 0.95,
        "confidence_band": "high",
        "caveat": "Confirm you've truly stopped using it before you cancel.",
        "claim_url": null,
        "odds": "very likely",
        "timeline": "instant–1 billing cycle",
        "agent": "sub_hunter",
        "agent_name": "Subscription Hunter",
        "verify": {
          "ok": true,
          "review": false,
          "needs_confirm": false,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility is auto-confirmable",
              "ok": true
            }
          ],
          "reasons": []
        }
      },
      {
        "id": "f_sub_4",
        "kind": "price_creep",
        "title": "Challenge NewsDaily+ price hike",
        "cadence": "yearly",
        "amount": 60.0,
        "currency": "$",
        "amount_label": "$60/yr",
        "unit_note": "$5.00/mo",
        "rule": "price_creep",
        "evidence": "Rose $7.99→$12.99/mo",
        "action": "dispute_price",
        "priority": "medium",
        "confidence": 0.85,
        "confidence_band": "high",
        "caveat": "The vendor can decline; cancelling is your leverage.",
        "claim_url": null,
        "odds": "often works",
        "timeline": "a few days",
        "agent": "sub_hunter",
        "agent_name": "Subscription Hunter",
        "verify": {
          "ok": true,
          "review": false,
          "needs_confirm": false,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility is auto-confirmable",
              "ok": true
            }
          ],
          "reasons": []
        }
      },
      {
        "id": "f_bill_1",
        "kind": "billing_error",
        "title": "Dispute MobileCo wireless overcharge",
        "cadence": "yearly",
        "amount": 276.0,
        "currency": "$",
        "amount_label": "$276/yr",
        "unit_note": "$23.00/mo",
        "rule": "billing_error",
        "evidence": "duplicate line fee on a $78.40 bill",
        "action": "dispute_charge",
        "priority": "high",
        "confidence": 0.9,
        "confidence_band": "high",
        "caveat": "Have the statement line ready — some fees are contractual.",
        "claim_url": null,
        "odds": "likely",
        "timeline": "1–2 statements",
        "agent": "billing_auditor",
        "agent_name": "Billing Auditor",
        "verify": {
          "ok": true,
          "review": false,
          "needs_confirm": false,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility is auto-confirmable",
              "ok": true
            }
          ],
          "reasons": []
        }
      },
      {
        "id": "f_pur_1",
        "kind": "price_drop",
        "title": "Claim price-drop refund: Noise-cancel headphones",
        "cadence": "once",
        "amount": 70.0,
        "currency": "$",
        "amount_label": "$70",
        "unit_note": "one-time",
        "rule": "refund_window",
        "evidence": "Bought $299 6d ago · now $229",
        "action": "request_refund",
        "priority": "medium",
        "confidence": 0.9,
        "confidence_band": "high",
        "caveat": "Only valid inside the retailer's price-protection window.",
        "claim_url": null,
        "odds": "likely",
        "timeline": "a few days",
        "agent": "refund_claimant",
        "agent_name": "Refund Claimant",
        "verify": {
          "ok": true,
          "review": false,
          "needs_confirm": false,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility is auto-confirmable",
              "ok": true
            }
          ],
          "reasons": []
        }
      },
      {
        "id": "f_flt_1",
        "kind": "flight_comp",
        "title": "Claim flight delay compensation (LHR→BCN)",
        "cadence": "once",
        "amount": 250.0,
        "currency": "€",
        "amount_label": "€250",
        "unit_note": "one-time",
        "rule": "eu261",
        "evidence": "LHR→BCN (1137km) delayed 4h on an EU carrier",
        "action": "file_claim",
        "priority": "high",
        "confidence": 0.7,
        "confidence_band": "medium",
        "caveat": "Void if the delay was 'extraordinary' (weather, ATC, strike).",
        "claim_url": "https://www.caa.co.uk/passengers/resolving-travel-problems/",
        "odds": "~60–70% if eligible",
        "timeline": "2–8 weeks",
        "agent": "entitlement_finder",
        "agent_name": "Entitlement Finder",
        "verify": {
          "ok": true,
          "review": true,
          "needs_confirm": true,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility needs YOUR confirmation (can't auto-verify)",
              "ok": false
            }
          ],
          "reasons": [
            "eligibility needs YOUR confirmation (can't auto-verify)"
          ]
        }
      },
      {
        "id": "f_set_1",
        "kind": "settlement",
        "title": "Claim: Amazon Prime / FTC settlement",
        "cadence": "once",
        "amount": 51.0,
        "currency": "$",
        "amount_label": "$51",
        "unit_note": "one-time",
        "rule": "settlement",
        "evidence": "open claim window",
        "action": "file_claim",
        "priority": "medium",
        "confidence": 0.6,
        "confidence_band": "review",
        "caveat": "You must have been an affected customer within the claim period.",
        "claim_url": "https://www.ftc.gov/enforcement/refunds",
        "odds": "if eligible",
        "timeline": "months",
        "agent": "entitlement_finder",
        "agent_name": "Entitlement Finder",
        "verify": {
          "ok": true,
          "review": true,
          "needs_confirm": true,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility needs YOUR confirmation (can't auto-verify)",
              "ok": false
            }
          ],
          "reasons": [
            "eligibility needs YOUR confirmation (can't auto-verify)"
          ]
        }
      },
      {
        "id": "f_unc_1",
        "kind": "unclaimed",
        "title": "Claim: State unclaimed property (utility deposit)",
        "cadence": "once",
        "amount": 214.0,
        "currency": "$",
        "amount_label": "$214",
        "unit_note": "one-time",
        "rule": "unclaimed",
        "evidence": "NAUPA",
        "action": "file_claim",
        "priority": "medium",
        "confidence": 0.85,
        "confidence_band": "high",
        "caveat": "Requires ID verification to prove the property is yours.",
        "claim_url": "https://www.missingmoney.com/",
        "odds": "high if it's you",
        "timeline": "2–12 weeks",
        "agent": "entitlement_finder",
        "agent_name": "Entitlement Finder",
        "verify": {
          "ok": true,
          "review": true,
          "needs_confirm": true,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility needs YOUR confirmation (can't auto-verify)",
              "ok": false
            }
          ],
          "reasons": [
            "eligibility needs YOUR confirmation (can't auto-verify)"
          ]
        }
      },
      {
        "id": "f_war_1",
        "kind": "warranty",
        "title": "Claim warranty repair: Laptop screen repair",
        "cadence": "once",
        "amount": 120.0,
        "currency": "$",
        "amount_label": "$120",
        "unit_note": "one-time",
        "rule": "warranty",
        "evidence": "covered repair under extended protection plan",
        "action": "file_claim",
        "priority": "medium",
        "confidence": 0.85,
        "confidence_band": "high",
        "caveat": "Check the plan covers this failure and is still active.",
        "claim_url": null,
        "odds": "high",
        "timeline": "days–weeks",
        "agent": "refund_claimant",
        "agent_name": "Refund Claimant",
        "verify": {
          "ok": true,
          "review": true,
          "needs_confirm": true,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility needs YOUR confirmation (can't auto-verify)",
              "ok": false
            }
          ],
          "reasons": [
            "eligibility needs YOUR confirmation (can't auto-verify)"
          ]
        }
      },
      {
        "id": "f_dep_1",
        "kind": "deposit",
        "title": "Recover Apartment security deposit",
        "cadence": "once",
        "amount": 850.0,
        "currency": "$",
        "amount_label": "$850",
        "unit_note": "one-time",
        "rule": "deposit",
        "evidence": "held 95d — past the statutory return window",
        "action": "request_refund",
        "priority": "high",
        "confidence": 0.8,
        "confidence_band": "medium",
        "caveat": "The landlord may deduct for documented damages.",
        "claim_url": null,
        "odds": "high",
        "timeline": "2–4 weeks",
        "agent": "entitlement_finder",
        "agent_name": "Entitlement Finder",
        "verify": {
          "ok": true,
          "review": true,
          "needs_confirm": true,
          "checks": [
            {
              "label": "amount is positive",
              "ok": true
            },
            {
              "label": "cites a real consumer-protection rule",
              "ok": true
            },
            {
              "label": "has source evidence",
              "ok": true
            },
            {
              "label": "within plausible range (≤ $5k)",
              "ok": true
            },
            {
              "label": "eligibility needs YOUR confirmation (can't auto-verify)",
              "ok": false
            }
          ],
          "reasons": [
            "eligibility needs YOUR confirmation (can't auto-verify)"
          ]
        }
      }
    ],
    "recurring_year": 755.76,
    "one_time": 1555.0,
    "one_time_by_currency": {
      "$": 1305.0,
      "€": 250.0
    },
    "one_time_label": "$1,305 + €250",
    "total_recoverable": 2310.76,
    "surface": {
      "subscriptions": [
        {
          "id": "sub_1",
          "name": "Disney+ Premium",
          "monthly": 19.99,
          "last_used_days": 142,
          "since": "2023-04"
        },
        {
          "id": "sub_2",
          "name": "CloudStore 2TB",
          "monthly": 9.99,
          "last_used_days": 8,
          "since": "2022-01"
        },
        {
          "id": "sub_3",
          "name": "FitPlus Gym App",
          "monthly": 14.99,
          "last_used_days": 210,
          "since": "2024-02"
        },
        {
          "id": "sub_4",
          "name": "NewsDaily+",
          "monthly": 12.99,
          "last_used_days": 20,
          "since": "2023-09",
          "old_monthly": 7.99
        }
      ],
      "bills": [
        {
          "id": "bill_1",
          "name": "MobileCo wireless",
          "amount": 78.4,
          "issue": "duplicate_line_fee",
          "overcharge": 23.0
        },
        {
          "id": "bill_2",
          "name": "PowerGrid electric",
          "amount": 134.1,
          "issue": null,
          "overcharge": 0
        }
      ],
      "purchases": [
        {
          "id": "pur_1",
          "name": "Noise-cancel headphones",
          "price": 299.0,
          "days_ago": 6,
          "price_now": 229.0,
          "store": "ElectroMart"
        }
      ],
      "flights": [
        {
          "id": "flt_1",
          "carrier": "EU carrier",
          "route": "LHR→BCN",
          "distance_km": 1137,
          "delay_hours": 4,
          "fare": 180.0,
          "owed": 250.0
        }
      ],
      "matches": [
        {
          "id": "set_1",
          "type": "settlement",
          "name": "Amazon Prime / FTC settlement",
          "est_payout": 51.0,
          "deadline": "open"
        },
        {
          "id": "unc_1",
          "type": "unclaimed",
          "name": "State unclaimed property (utility deposit)",
          "est_payout": 214.0,
          "source": "NAUPA"
        }
      ],
      "warranties": [
        {
          "id": "war_1",
          "name": "Laptop screen repair",
          "issue": "covered_repair",
          "payout": 120.0,
          "plan": "extended protection plan"
        }
      ],
      "deposits": [
        {
          "id": "dep_1",
          "name": "Apartment security deposit",
          "held_days": 95,
          "amount": 850.0,
          "overdue": true
        }
      ]
    }
  },
  "actions": [
    {
      "id": "act_1",
      "finding_id": "f_sub_1",
      "kind": "dead_subscription",
      "title": "Cancel Disney+ Premium",
      "verb": "Cancel",
      "amount": 239.88,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$240/yr",
      "unit_note": "$19.99/mo",
      "priority": "high",
      "evidence": "Unused 142 days · billing since 2023-04",
      "rule": "dead_sub",
      "agent": "sub_hunter",
      "agent_name": "Subscription Hunter",
      "verify": {
        "ok": true,
        "review": false,
        "needs_confirm": false,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility is auto-confirmable",
            "ok": true
          }
        ],
        "reasons": []
      },
      "confidence": 0.95,
      "confidence_band": "high",
      "caveat": "Confirm you've truly stopped using it before you cancel.",
      "claim_url": null,
      "odds": "very likely",
      "timeline": "instant–1 billing cycle",
      "draft": "Subject: Cancel my subscription — effective immediately\n\nPlease cancel my plan and confirm in writing, including any proration owed. It has gone unused (Unused 142 days · billing since 2023-04). This stops a recurring leak of $240/yr.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_2",
      "finding_id": "f_sub_3",
      "kind": "dead_subscription",
      "title": "Cancel FitPlus Gym App",
      "verb": "Cancel",
      "amount": 179.88,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$180/yr",
      "unit_note": "$14.99/mo",
      "priority": "high",
      "evidence": "Unused 210 days · billing since 2024-02",
      "rule": "dead_sub",
      "agent": "sub_hunter",
      "agent_name": "Subscription Hunter",
      "verify": {
        "ok": true,
        "review": false,
        "needs_confirm": false,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility is auto-confirmable",
            "ok": true
          }
        ],
        "reasons": []
      },
      "confidence": 0.95,
      "confidence_band": "high",
      "caveat": "Confirm you've truly stopped using it before you cancel.",
      "claim_url": null,
      "odds": "very likely",
      "timeline": "instant–1 billing cycle",
      "draft": "Subject: Cancel my subscription — effective immediately\n\nPlease cancel my plan and confirm in writing, including any proration owed. It has gone unused (Unused 210 days · billing since 2024-02). This stops a recurring leak of $180/yr.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_3",
      "finding_id": "f_sub_4",
      "kind": "price_creep",
      "title": "Challenge NewsDaily+ price hike",
      "verb": "Challenge",
      "amount": 60.0,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$60/yr",
      "unit_note": "$5.00/mo",
      "priority": "medium",
      "evidence": "Rose $7.99→$12.99/mo",
      "rule": "price_creep",
      "agent": "sub_hunter",
      "agent_name": "Subscription Hunter",
      "verify": {
        "ok": true,
        "review": false,
        "needs_confirm": false,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility is auto-confirmable",
            "ok": true
          }
        ],
        "reasons": []
      },
      "confidence": 0.85,
      "confidence_band": "high",
      "caveat": "The vendor can decline; cancelling is your leverage.",
      "claim_url": null,
      "odds": "often works",
      "timeline": "a few days",
      "draft": "Subject: Apply current rate or cancel\n\nMy price rose (Rose $7.99→$12.99/mo). Please match the current new-customer / retention rate, or treat this as notice of cancellation. Recovers $60/yr. Basis: Silent price increases can be challenged or matched to the new-customer rate (retention offer).",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_4",
      "finding_id": "f_bill_1",
      "kind": "billing_error",
      "title": "Dispute MobileCo wireless overcharge",
      "verb": "Dispute",
      "amount": 276.0,
      "cadence": "yearly",
      "currency": "$",
      "amount_label": "$276/yr",
      "unit_note": "$23.00/mo",
      "priority": "high",
      "evidence": "duplicate line fee on a $78.40 bill",
      "rule": "billing_error",
      "agent": "billing_auditor",
      "agent_name": "Billing Auditor",
      "verify": {
        "ok": true,
        "review": false,
        "needs_confirm": false,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility is auto-confirmable",
            "ok": true
          }
        ],
        "reasons": []
      },
      "confidence": 0.9,
      "confidence_band": "high",
      "caveat": "Have the statement line ready — some fees are contractual.",
      "claim_url": null,
      "odds": "likely",
      "timeline": "1–2 statements",
      "draft": "Subject: Dispute an incorrect charge\n\nThere is an erroneous charge on my account (duplicate line fee on a $78.40 bill). Please remove it and credit me — worth $276/yr if recurring. Basis: Duplicate charges / undisclosed fees are recoverable; card issuers allow chargebacks within 60–120 days.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_5",
      "finding_id": "f_pur_1",
      "kind": "price_drop",
      "title": "Claim price-drop refund: Noise-cancel headphones",
      "verb": "Refund",
      "amount": 70.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$70",
      "unit_note": "one-time",
      "priority": "medium",
      "evidence": "Bought $299 6d ago · now $229",
      "rule": "refund_window",
      "agent": "refund_claimant",
      "agent_name": "Refund Claimant",
      "verify": {
        "ok": true,
        "review": false,
        "needs_confirm": false,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility is auto-confirmable",
            "ok": true
          }
        ],
        "reasons": []
      },
      "confidence": 0.9,
      "confidence_band": "high",
      "caveat": "Only valid inside the retailer's price-protection window.",
      "claim_url": null,
      "odds": "likely",
      "timeline": "a few days",
      "draft": "Subject: Price-protection refund request\n\nBought $299 6d ago · now $229. Per your price-protection / refund-window policy, please refund the one-time difference of $70. Basis: Many retailers and airlines owe a refund for a price drop or cancellation within a stated window.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_6",
      "finding_id": "f_flt_1",
      "kind": "flight_comp",
      "title": "Claim flight delay compensation (LHR→BCN)",
      "verb": "File claim",
      "amount": 250.0,
      "cadence": "once",
      "currency": "€",
      "amount_label": "€250",
      "unit_note": "one-time",
      "priority": "high",
      "evidence": "LHR→BCN (1137km) delayed 4h on an EU carrier",
      "rule": "eu261",
      "agent": "entitlement_finder",
      "agent_name": "Entitlement Finder",
      "verify": {
        "ok": true,
        "review": true,
        "needs_confirm": true,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility needs YOUR confirmation (can't auto-verify)",
            "ok": false
          }
        ],
        "reasons": [
          "eligibility needs YOUR confirmation (can't auto-verify)"
        ]
      },
      "confidence": 0.7,
      "confidence_band": "medium",
      "caveat": "Void if the delay was 'extraordinary' (weather, ATC, strike).",
      "claim_url": "https://www.caa.co.uk/passengers/resolving-travel-problems/",
      "odds": "~60–70% if eligible",
      "timeline": "2–8 weeks",
      "draft": "Subject: EU261 delay compensation claim\n\nMy flight LHR→BCN (1137km) delayed 4h on an EU carrier. Under EU261/UK261 I am owed €250 in cash compensation (one-time, not a voucher). Please process. Basis: EU261/UK261: flights delayed 3h+ owe €250 (<1500km), €400 (1500–3500km), or €600 cash.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_7",
      "finding_id": "f_set_1",
      "kind": "settlement",
      "title": "Claim: Amazon Prime / FTC settlement",
      "verb": "File claim",
      "amount": 51.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$51",
      "unit_note": "one-time",
      "priority": "medium",
      "evidence": "open claim window",
      "rule": "settlement",
      "agent": "entitlement_finder",
      "agent_name": "Entitlement Finder",
      "verify": {
        "ok": true,
        "review": true,
        "needs_confirm": true,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility needs YOUR confirmation (can't auto-verify)",
            "ok": false
          }
        ],
        "reasons": [
          "eligibility needs YOUR confirmation (can't auto-verify)"
        ]
      },
      "confidence": 0.6,
      "confidence_band": "review",
      "caveat": "You must have been an affected customer within the claim period.",
      "claim_url": "https://www.ftc.gov/enforcement/refunds",
      "odds": "if eligible",
      "timeline": "months",
      "draft": "Filing my consumer claim (open claim window) for a one-time $51. Basis: Open class-action settlements (e.g. the $1.5B Amazon Prime / FTC fund) pay eligible consumers who file.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_8",
      "finding_id": "f_unc_1",
      "kind": "unclaimed",
      "title": "Claim: State unclaimed property (utility deposit)",
      "verb": "File claim",
      "amount": 214.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$214",
      "unit_note": "one-time",
      "priority": "medium",
      "evidence": "NAUPA",
      "rule": "unclaimed",
      "agent": "entitlement_finder",
      "agent_name": "Entitlement Finder",
      "verify": {
        "ok": true,
        "review": true,
        "needs_confirm": true,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility needs YOUR confirmation (can't auto-verify)",
            "ok": false
          }
        ],
        "reasons": [
          "eligibility needs YOUR confirmation (can't auto-verify)"
        ]
      },
      "confidence": 0.85,
      "confidence_band": "high",
      "caveat": "Requires ID verification to prove the property is yours.",
      "claim_url": "https://www.missingmoney.com/",
      "odds": "high if it's you",
      "timeline": "2–12 weeks",
      "draft": "Filing to recover property held in my name (NAUPA), a one-time $214. Basis: State unclaimed-property programs (NAUPA) hold forgotten deposits, refunds, and balances under your name.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_9",
      "finding_id": "f_war_1",
      "kind": "warranty",
      "title": "Claim warranty repair: Laptop screen repair",
      "verb": "File claim",
      "amount": 120.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$120",
      "unit_note": "one-time",
      "priority": "medium",
      "evidence": "covered repair under extended protection plan",
      "rule": "warranty",
      "agent": "refund_claimant",
      "agent_name": "Refund Claimant",
      "verify": {
        "ok": true,
        "review": true,
        "needs_confirm": true,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility needs YOUR confirmation (can't auto-verify)",
            "ok": false
          }
        ],
        "reasons": [
          "eligibility needs YOUR confirmation (can't auto-verify)"
        ]
      },
      "confidence": 0.85,
      "confidence_band": "high",
      "caveat": "Check the plan covers this failure and is still active.",
      "claim_url": null,
      "odds": "high",
      "timeline": "days–weeks",
      "draft": "Subject: Warranty claim — covered repair\n\nMy item is covered (covered repair under extended protection plan). Please repair or replace at no cost under the plan; value $120 (one-time). Basis: Active warranty / protection plans cover repair or replacement at no cost — don't pay out of pocket.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    },
    {
      "id": "act_10",
      "finding_id": "f_dep_1",
      "kind": "deposit",
      "title": "Recover Apartment security deposit",
      "verb": "Refund",
      "amount": 850.0,
      "cadence": "once",
      "currency": "$",
      "amount_label": "$850",
      "unit_note": "one-time",
      "priority": "high",
      "evidence": "held 95d — past the statutory return window",
      "rule": "deposit",
      "agent": "entitlement_finder",
      "agent_name": "Entitlement Finder",
      "verify": {
        "ok": true,
        "review": true,
        "needs_confirm": true,
        "checks": [
          {
            "label": "amount is positive",
            "ok": true
          },
          {
            "label": "cites a real consumer-protection rule",
            "ok": true
          },
          {
            "label": "has source evidence",
            "ok": true
          },
          {
            "label": "within plausible range (≤ $5k)",
            "ok": true
          },
          {
            "label": "eligibility needs YOUR confirmation (can't auto-verify)",
            "ok": false
          }
        ],
        "reasons": [
          "eligibility needs YOUR confirmation (can't auto-verify)"
        ]
      },
      "confidence": 0.8,
      "confidence_band": "medium",
      "caveat": "The landlord may deduct for documented damages.",
      "claim_url": null,
      "odds": "high",
      "timeline": "2–4 weeks",
      "draft": "Subject: Return of overdue security deposit\n\nMy deposit is overdue (held 95d — past the statutory return window). Please return $850 in full, plus any statutory penalty for late return. Basis: Security deposits must be returned within a statutory window (often 14–30 days); overdue deposits are recoverable.",
      "approvalState": "pending",
      "status": "drafted",
      "claimedAt": null
    }
  ],
  "run": {
    "run_id": "run_954cf0",
    "model": "deterministic-fallback",
    "live": false,
    "latency_ms": 9949,
    "actions": 10,
    "agents": 4,
    "verified": 5,
    "needs_confirm": 5,
    "flagged": 5,
    "created_at": "2026-06-10T01:15:23.922824+00:00"
  },
  "reasoning": [
    {
      "t": "Plan: classify 10 charges, retrieve each one's legal basis via MongoDB Atlas Vector Search, then draft a claim you approve.",
      "tone": "cyan"
    },
    {
      "t": "Coordinator dispatched 4 specialist agents in parallel",
      "tone": "cyan"
    },
    {
      "t": "Subscription Hunter → 3 found ($480)",
      "tone": "warn"
    },
    {
      "t": "Billing Auditor → 1 found ($276)",
      "tone": "warn"
    },
    {
      "t": "Refund Claimant → 2 found ($190)",
      "tone": "warn"
    },
    {
      "t": "Entitlement Finder → 4 found ($1,365)",
      "tone": "warn"
    },
    {
      "t": "Verifier auto-confirmed 5/10 · 5 need your eligibility sign-off",
      "tone": "ok"
    },
    {
      "t": "Claim Drafter attached 10 ready-to-send drafts",
      "tone": "cyan"
    },
    {
      "t": "One-time payouts are never annualized; amounts come from the rules, not the model",
      "tone": "dim"
    },
    {
      "t": "Nothing is sent without your approval",
      "tone": "ok"
    }
  ],
  "swarm": [
    {
      "id": "sub_hunter",
      "name": "Subscription Hunter",
      "mandate": "recurring subscription leaks",
      "count": 3,
      "amount": 479.76,
      "status": "active"
    },
    {
      "id": "billing_auditor",
      "name": "Billing Auditor",
      "mandate": "duplicate fees & billing errors",
      "count": 1,
      "amount": 276.0,
      "status": "active"
    },
    {
      "id": "refund_claimant",
      "name": "Refund Claimant",
      "mandate": "refunds & warranty within policy windows",
      "count": 2,
      "amount": 190.0,
      "status": "active"
    },
    {
      "id": "entitlement_finder",
      "name": "Entitlement Finder",
      "mandate": "money owed to you by law / settlement",
      "count": 4,
      "amount": 1365.0,
      "status": "active"
    }
  ],
  "verified": 5,
  "needs_confirm": 5,
  "flagged": 5,
  "totals": {
    "approved_recurring_year": 0,
    "approved_one_time": 0,
    "pending_recurring_year": 755.76,
    "pending_one_time": 1555.0,
    "paid_recurring_year": 0,
    "paid_one_time": 0,
    "sent_count": 0,
    "paid_count": 0
  },
  "recurring_year": 755.76,
  "one_time": 1555.0,
  "recoverable": 2310.76,
  "audit": [
    {
      "event_id": "au_0001",
      "actor_type": "system",
      "actor_name": "Recoup scanner",
      "event_type": "SCAN_RUN",
      "label": "Scanned money surface — 10 items: $756/yr recurring + $1,305 + €250 one-time",
      "evidence_ref": "",
      "amount": 2310.76,
      "trace_id": "",
      "timestamp": "2026-06-10T01:15:13.973301+00:00",
      "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
      "hash": "90ffb12fec928cf3f73f75cc647259ef75e6eccd7100ddf35e10f0329aaf48f4"
    },
    {
      "event_id": "au_0002",
      "actor_type": "agent",
      "actor_name": "Gemini agent",
      "event_type": "PLAN_DRAFTED",
      "label": "10 claims drafted (fallback)",
      "evidence_ref": "",
      "amount": 0.0,
      "trace_id": "",
      "timestamp": "2026-06-10T01:15:23.922766+00:00",
      "prev_hash": "90ffb12fec928cf3f73f75cc647259ef75e6eccd7100ddf35e10f0329aaf48f4",
      "hash": "12bfa0120a654a9cf96143c07c7c815e6f0bf35181ae6bd66c52152596c812ca"
    }
  ],
  "auditIntegrity": {
    "intact": true,
    "count": 2,
    "head": "12bfa0120a654a9cf96143c07c7c815e6f0bf35181ae6bd66c52152596c812ca"
  },
  "generated": "static-fallback"
};
