/\*\*

- @function setSelectedCiaAndEnvironment
- @param {string} cia
- @param {EnvironmentModel} environment
- @param {string} type
  \*/
  private setSelectedCiaAndEnvironment(cia: string, environment: EnvironmentModel | undefined, type: string): void {
  if (type === 'SOURCE') {
  this.\_firewallRulesRequestFacade.setSelectedCiaAndEnvironementSource({ environment, cia });
  } else if (type === 'DESTINATION') {
  this.\_firewallRulesRequestFacade.setSelectedCiaAndEnvironementDestination({ environment, cia });
  }
  }

/\*\*

- @function loadServersByCiaAndEnvironment
- @param {string} cia
- @param {EnvironmentModel} environment
- @param {string} type
- @param {number} firstRow
- @param {number} rows
- @param {string} searchTerm
  \*/
  private loadServersByCiaAndEnvironment(cia: string, environment: EnvironmentModel | undefined, type: string, firstRow: number, rows: number, searchTerm?: string): void {
  const customParams = this.\_firewallRulesRequestFacade.buildPageableParamsMultiselect(firstRow, rows, searchTerm);
  this.loadingSourceServers = true; // Or loadingDestinationServers, depending on the type
  const serverList$ = this.\_firewallRulesRequestFacade.lazyLoadDofTicketServersByCiaAndEnvironment(cia, environment, customParams, type);

if (type === 'SOURCE') {
this.ipsSourceList$ = serverList$.pipe(finalize(() => (this.loadingSourceServers = false)));
  } else if (type === 'DESTINATION') {
    this.ipsDestinationList$ = serverList$.pipe(finalize(() => (this.loadingDestinationServers = false)));
}
}

/\*\*

- @function onEnvironmentSelected
- @param {EnvironmentModel | undefined} environment
- @param {string} cia
- @param {string} type
  \*/
  onEnvironmentSelected(environment: EnvironmentModel | undefined, cia: string, type: string): void {
  this.setSelectedCiaAndEnvironment(cia, environment, type);
  const { firstRow, rows } = type === 'SOURCE' ? this : this;
  this.loadServersByCiaAndEnvironment(cia, environment, type, firstRow, rows);
  }

/\*\*

- @function onPageChange
- @param {number} firstRow
- @param {number} rows
- @param {string} type
  \*/
  onPageChange(firstRow: number, rows: number, type: string): void {
  const data = type === 'SOURCE' ? this.\_firewallRulesRequestFacade.getSelectedCiaAndEnvironementSource() : this.\_firewallRulesRequestFacade.getSelectedCiaAndEnvironementDestination();
  if (data) {
  this[type === 'SOURCE' ? 'firstRowSourceServers' : 'firstRowDestinationServers'] = firstRow;
  this[type === 'SOURCE' ? 'rowsSourceServers' : 'rowsDestinationServers'] = rows;
  this.loadServersByCiaAndEnvironment(data.cia, data.environment, type, firstRow, rows);
  }
  }

/\*\*

- @function onFilterServers
- @param {string} searchTerm
- @param {string} type
  \*/
  onFilterServers(searchTerm: string, type: string): void {
  const data = type === 'SOURCE' ? this.\_firewallRulesRequestFacade.getSelectedCiaAndEnvironementSource() : this.\_firewallRulesRequestFacade.getSelectedCiaAndEnvironementDestination();
  if (data) {
  this.loadServersByCiaAndEnvironment(data.cia, data.environment, type, 0, type === 'SOURCE' ? 10 : 100, searchTerm);
  }
  }
