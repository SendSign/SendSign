# CoSeal Field Mapping Configuration

## Overview

The `CoSeal_Field_Mapping__mdt` custom metadata type maps Salesforce object fields to CoSeal merge fields. This allows automatic population of document templates with data from Salesforce records.

## Custom Metadata Type: `CoSeal_Field_Mapping__mdt`

### Fields

| Field API Name | Type | Description |
|---|---|---|
| `Salesforce_Field__c` | Text(255) | API name of the Salesforce field (e.g., `Account.Name`) |
| `CoSeal_Merge_Field__c` | Text(255) | Corresponding CoSeal merge field name (e.g., `client_name`) |
| `Template_Id__c` | Text(36) | CoSeal template UUID this mapping applies to. Use `All` for all templates. |

## Example Mappings

| Salesforce Field | CoSeal Merge Field | Template |
|---|---|---|
| `Account.Name` | `client_name` | All |
| `Opportunity.Amount` | `contract_amount` | SOW Template |
| `Contact.Email` | `signer_email` | All |
| `Contact.Name` | `signer_name` | All |
| `Opportunity.CloseDate` | `effective_date` | SOW Template |
| `Account.BillingStreet` | `billing_address` | Invoice Template |
| `Account.BillingCity` | `billing_city` | Invoice Template |
| `Account.BillingState` | `billing_state` | Invoice Template |

## How to Configure

1. Go to **Setup** → **Custom Metadata Types** → **CoSeal Field Mapping** → **Manage Records**
2. Click **New** to create a mapping
3. Enter the Salesforce field API name, CoSeal merge field name, and template ID
4. Save

## Notes

- Field mappings are per-template. Use `All` in the Template ID to apply a mapping to all templates.
- Salesforce field names should be the API name (e.g., `Name`, `Amount`, `CloseDate`)
- For related object fields, use dot notation (e.g., `Account.Name` when on Opportunity)
- Changes to custom metadata take effect immediately — no deployment needed
