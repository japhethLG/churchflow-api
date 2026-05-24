import { DateRangeRequestDto } from "@shared/dto/date-range.request.dto";

// Query for the admin Reports → Pledge Dynamics tab.
// `dateFrom`/`dateTo` bracket `pledge.createdAt` — cohort-style: the
// report answers "of pledges started in this window, how are they
// doing?" When both bounds are absent the endpoint reports across all
// time.
export class PledgesReportQueryRequestDto extends DateRangeRequestDto {}
