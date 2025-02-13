import {
  Alert,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  EmptyStateSecondaryActions,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  Label,
  Spinner,
  Title,
  Split,
  SplitItem,
} from '@patternfly/react-core'
import { InfoCircleIcon } from '@patternfly/react-icons'
import * as _ from 'lodash'
import * as React from 'react'
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk'
import {
  crunchyProviderName,
  crunchyProviderType,
  cockroachdbProviderType,
  mongoProviderName,
  mongoProviderType,
  cockroachdbProviderName,
} from '../const.ts'
import { DBAAS_PROVIDER_KIND } from '../catalog/const.ts'
import {
  fetchInventoriesAndMapByNSAndRules,
  fetchObjectsClusterOrNS,
  isDbaasConnectionUsed,
  disableNSSelection,
  filterInventoriesByConnNS,
} from '../utils.ts'
import FlexForm from './form/flexForm.tsx'
import FormBody from './form/formBody.tsx'
import FormHeader from './form/formHeader.tsx'
import InstanceListFilter from './instanceListFilter.tsx'
import InstanceTable from './instanceTable'
import './_dbaas-import-view.css'

export const handleTryAgain = () => {
  location.reload()
}

export const handleCancel = () => {
  window.history.back()
}

const InstanceListPage = () => {
  const [noInstances, setNoInstances] = React.useState(false)
  const [statusMsg, setStatusMsg] = React.useState('')
  const [fetchInstancesFailed, setFetchInstancesFailed] = React.useState(false)
  const [textInputNameValue, setTextInputNameValue] = React.useState('')
  const [showResults, setShowResults] = React.useState(false)
  const [inventories, setInventories] = React.useState([])
  const [selectedDBProvider, setSelectedDBProvider] = React.useState('')
  const [dbProviderName, setDBProviderName] = React.useState()
  const [dbProviderLogoUrl, setDBProviderLogoUrl] = React.useState('')
  const [selectedInventory, setSelectedInventory] = React.useState({})
  const [dbaasConnectionList, setDbaasConnectionList] = React.useState([])
  const [serviceBindingList, setServiceBindingList] = React.useState([])
  const [connectionAndServiceBindingList, setConnectionAndServiceBindingList] = React.useState([])

  const currentNS = window.location.pathname.split('/')[3]

  const dbProviderTitle = (
    <div className="co-catalog-item-details">
      <span className="co-catalog-item-icon">
        <img className="catalog-item-header-pf-icon" src={dbProviderLogoUrl} alt="logo" aria-hidden />
      </span>
      <div>
        Connect {dbProviderName} <Label className="ocs-preview-badge extra-left-margin">Service Preview</Label>
        <p className="pf-c-form__helper-text">The selected database instance will be added to the topology view.</p>
      </div>
    </div>
  )

  const [dbaasProviders, isProviderFetched, errorMsg] = useK8sWatchResource({
    kind: DBAAS_PROVIDER_KIND,
    isList: false,
  })

  const filteredInstances = React.useMemo(
    () =>
      selectedInventory?.instances?.filter((instance) =>
        instance?.name?.toLowerCase().includes(textInputNameValue.toLowerCase())
      ),
    [selectedInventory.instances, textInputNameValue]
  )

  const mapDBaaSConnectionsAndServiceBindings = () => {
    const newDbaasConnectionList = dbaasConnectionList
    const newServiceBindingList = serviceBindingList
    const newConnectionAndServiceBindingList = []

    if (newDbaasConnectionList.length > 0) {
      newDbaasConnectionList.forEach((dbaasConnection) => {
        if (
          selectedInventory?.instances?.find((instance) => instance.instanceID === dbaasConnection.spec?.instanceID)
        ) {
          const connectionObj = {
            instanceID: dbaasConnection?.spec?.instanceID,
            instanceName: dbaasConnection?.metadata?.name,
            connectionStatus: _.isEmpty(dbaasConnection?.status) ? '-' : dbaasConnection?.status?.conditions[0]?.reason,
            errMsg: 'N/A',
            applications: [],
            namespace: _.isEmpty(dbaasConnection?.metadata?.namespace) ? '-' : dbaasConnection?.metadata?.namespace,
            providerAcct: dbaasConnection?.spec?.inventoryRef?.name,
            providerNamespace: dbaasConnection?.spec?.inventoryRef?.namespace,
          }
          if (!_.isEmpty(dbaasConnection?.status) && dbaasConnection?.status?.conditions[0]?.status !== 'True') {
            connectionObj.errMsg = dbaasConnection?.status?.conditions[0]?.message
          }
          if (newServiceBindingList.find((serviceBinding) => isDbaasConnectionUsed(serviceBinding, dbaasConnection))) {
            newServiceBindingList.forEach((serviceBinding) => {
              if (isDbaasConnectionUsed(serviceBinding, dbaasConnection)) {
                const newConnectionObj = _.extend({}, connectionObj)
                newConnectionObj.applications.push(serviceBinding.spec?.application)
              }
            })
          }
          newConnectionAndServiceBindingList.push(connectionObj)
        }
      })
    }

    setConnectionAndServiceBindingList(newConnectionAndServiceBindingList)
  }

  async function fetchServiceBindings() {
    const serviceBindings = await fetchObjectsClusterOrNS('binding.operators.coreos.com', 'v1alpha1', 'servicebindings')
    setServiceBindingList(serviceBindings)
  }

  async function fetchDBaaSConnections() {
    const connections = await fetchObjectsClusterOrNS('dbaas.redhat.com', 'v1alpha1', 'dbaasconnections')
    setDbaasConnectionList(connections)
  }

  const checkInventoryStatus = (inventory) => {
    if (inventory?.status?.conditions[0]?.type === 'SpecSynced') {
      if (inventory?.status?.conditions[0]?.status === 'False') {
        setFetchInstancesFailed(true)
        setStatusMsg(inventory?.status?.conditions[0]?.message)
      } else {
        setFetchInstancesFailed(false)
        setStatusMsg('')
      }
    } else {
      setFetchInstancesFailed(true)
      setStatusMsg('Could not connect with database provider')
    }
    setShowResults(true)
  }

  const handleInventorySelection = (value) => {
    const inventory = _.find(inventories, (inv) => inv.name === value)
    setSelectedInventory(inventory)

    // clear filter value when switch inventory
    setTextInputNameValue('')
    setShowResults(false)
    checkInventoryStatus(inventory)
  }

  const parseSelectedDBProvider = () => {
    const dbProviderType = _.last(window.location.pathname.split('/'))
    let providerInfo = {}
    if (!_.isEmpty(dbaasProviders)) {
      providerInfo = _.find(dbaasProviders?.items, (provider) => provider?.metadata?.name === dbProviderType)
      setDBProviderLogoUrl(
        `data:${providerInfo.spec?.provider?.icon?.mediatype};base64,${providerInfo.spec?.provider?.icon?.base64data}`
      )
    }

    // Cannot parse provider name from CRD
    if (dbProviderType === crunchyProviderType) {
      setDBProviderName(crunchyProviderName)
    }
    if (dbProviderType === mongoProviderType) {
      setDBProviderName(mongoProviderName)
    }
    if (dbProviderType === cockroachdbProviderType) {
      setDBProviderName(cockroachdbProviderName)
    }
    setSelectedDBProvider(dbProviderType)
  }

  async function filteredInventoriesByValidConnectionNS() {
    const inventoryItems = []
    const inventoryData = await fetchInventoriesAndMapByNSAndRules().catch((error) => {
      setFetchInstancesFailed(true)
      setStatusMsg(error)
    })

    return filterInventoriesByConnNS(inventoryData, currentNS)
  }

  async function fetchInstances() {
    const inventories = []
    const inventoryItems = await filteredInventoriesByValidConnectionNS()

    if (inventoryItems.length > 0) {
      const filteredInventories = _.filter(
        inventoryItems,
        (inventory) => inventory.spec?.providerRef?.name === selectedDBProvider
      )
      if (!_.isEmpty(filteredInventories)) {
        filteredInventories.forEach((inventory, index) => {
          const obj = { id: 0, name: '', namespace: '', instances: [], status: {} }
          obj.id = index
          obj.name = inventory.metadata.name
          obj.namespace = inventory.metadata.namespace
          obj.status = inventory.status

          if (
            inventory.status?.conditions[0]?.status !== 'False' &&
            inventory.status?.conditions[0]?.type === 'SpecSynced'
          ) {
            inventory.status?.instances?.map((instance) => (instance.provider = inventory.spec?.providerRef?.name))
            obj.instances = inventory.status?.instances
          }

          inventories.push(obj)
        })

        setInventories(inventories)
      } else {
        setNoInstances(true)
        setStatusMsg('There is no Provider Account.')
      }

      // Set the first inventory as the selected inventory by default
      if (inventories.length > 0) {
        setSelectedInventory(inventories[0])
        checkInventoryStatus(inventories[0])
      }
    } else {
      setNoInstances(true)
      setStatusMsg('There is no Provider Account.')
    }

    setShowResults(true)
  }

  React.useEffect(() => {
    parseSelectedDBProvider()
  }, [isProviderFetched])

  React.useEffect(() => {
    disableNSSelection()
    parseSelectedDBProvider()
    if (!_.isEmpty(selectedDBProvider)) {
      fetchInstances()
    }
  }, [currentNS, selectedDBProvider])

  React.useEffect(() => {
    fetchDBaaSConnections()
    fetchServiceBindings()
  }, [currentNS, selectedDBProvider, selectedInventory])

  React.useEffect(() => {
    mapDBaaSConnectionsAndServiceBindings()
  }, [dbaasConnectionList, serviceBindingList, selectedInventory])

  return (
    <FlexForm className="instance-table-container">
      <FormBody flexLayout>
        <FormHeader title={dbProviderTitle} helpText="" marginBottom="lg" />
        {!showResults ? (
          <EmptyState>
            <EmptyStateIcon variant="container" component={Spinner} />
            <Title size="lg" headingLevel="h3">
              Fetching Provider Accounts...
            </Title>
          </EmptyState>
        ) : (
          <>
            {noInstances ? (
              <>
                <EmptyState>
                  <EmptyStateIcon variant="container" component={InfoCircleIcon} className="warning-icon" />
                  <Title headingLevel="h2" size="md">
                    No Database Instances
                  </Title>
                  <EmptyStateBody>
                    There are no Provider Accounts available. Please work with an administrator to create one first.
                  </EmptyStateBody>
                </EmptyState>
              </>
            ) : (
              <>
                <FormGroup label="Provider Account" fieldId="provider-account" className="provider-account-selection">
                  <FormSelect
                    value={selectedInventory.name}
                    onChange={handleInventorySelection}
                    aria-label="Provider Account"
                  >
                    {inventories?.map((inventory, index) => (
                      <FormSelectOption key={index} value={inventory.name} label={inventory.name} />
                    ))}
                  </FormSelect>
                </FormGroup>
                {fetchInstancesFailed ? (
                  <EmptyState>
                    <EmptyStateIcon variant="container" component={InfoCircleIcon} className="warning-icon" />
                    <Title headingLevel="h2" size="md">
                      Database instances retrieval failed
                    </Title>
                    <EmptyStateBody>Database instances could not be retrieved. Please try again.</EmptyStateBody>
                    <Alert
                      variant="danger"
                      isInline
                      title="An error occured"
                      className="co-alert co-break-word extra-top-margin"
                    >
                      <div>{statusMsg}</div>
                    </Alert>
                    <Button variant="primary" onClick={handleTryAgain}>
                      Try Again
                    </Button>
                    <EmptyStateSecondaryActions>
                      <Button variant="link" onClick={handleCancel}>
                        Close
                      </Button>
                    </EmptyStateSecondaryActions>
                  </EmptyState>
                ) : (
                  <>
                    <FormGroup label="Database Instance" fieldId="instance-id-filter">
                      <Split>
                        <SplitItem>
                          <InstanceListFilter
                            textInputNameValue={textInputNameValue}
                            setTextInputNameValue={setTextInputNameValue}
                          />
                        </SplitItem>
                        <SplitItem>
                          <Button
                            isDisabled={inventories.length === 0}
                            component="a"
                            href={`/k8s/ns/${currentNS}/rhoda-create-database-instance/db/${selectedDBProvider}/pa/${selectedInventory?.name}`}
                            variant="secondary"
                            className="extra-left-margin"
                          >
                            Create Database Instance
                          </Button>
                        </SplitItem>
                      </Split>
                    </FormGroup>
                    <FormSection fullWidth flexLayout className="no-top-margin">
                      <InstanceTable
                        connectionAndServiceBindingList={connectionAndServiceBindingList}
                        isLoading={!showResults}
                        data={selectedInventory}
                        isSelectable={selectedInventory?.instances?.length > 0 && filteredInstances.length > 0}
                        filteredInstances={filteredInstances}
                      />
                    </FormSection>
                  </>
                )}
              </>
            )}
          </>
        )}
      </FormBody>
    </FlexForm>
  )
}

export default InstanceListPage
